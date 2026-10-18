import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from database import SessionLocal
from models import User, LoginHistory, Admin, PasswordResetOTP
from schemas import (
    RegisterRequest,
    LoginRequest,
    ForgotPasswordRequest,
    VerifyOtpRequest,
    ResetPasswordRequest,
)

from email_utils import send_otp_email


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)


pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


OTP_VALID_MINUTES = 2


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


@router.post("/register")
def register(
    user_data: RegisterRequest,
    db: Session = Depends(get_db)
):
    email = user_data.email.strip().lower()

    if user_data.password != user_data.confirm_password:
        raise HTTPException(
            status_code=400,
            detail="Passwords do not match"
        )

    if not user_data.terms_accepted:
        raise HTTPException(
            status_code=400,
            detail="You must accept the terms and conditions"
        )

    existing_user = db.query(User).filter(
        User.email == email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    existing_admin = db.query(Admin).filter(
        Admin.email == email
    ).first()

    if existing_admin:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    hashed_password = pwd_context.hash(
        user_data.password
    )

    new_user = User(
        name=user_data.name,
        email=email,
        password_hash=hashed_password,
        terms_accepted=user_data.terms_accepted,
        status="active"
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "status": "success",
        "message": "Registration successful",
        "user": {
            "id": new_user.id,
            "name": new_user.name,
            "email": new_user.email,
            "status": new_user.status
        }
    }


@router.post("/login")
def login(
    request: Request,
    user_data: LoginRequest,
    db: Session = Depends(get_db)
):
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    email = user_data.email.strip().lower()

    admin = db.query(Admin).filter(
        Admin.email == email
    ).first()

    if admin:
        if not pwd_context.verify(
            user_data.password,
            admin.password_hash
        ):
            history = LoginHistory(
                user_id=None,
                email=admin.email,
                ip_address=client_ip,
                user_agent=user_agent,
                status="failed",
                failure_reason="Invalid email or password"
            )

            db.add(history)
            db.commit()

            raise HTTPException(
                status_code=401,
                detail="Invalid email or password"
            )

        history = LoginHistory(
            user_id=None,
            email=admin.email,
            ip_address=client_ip,
            user_agent=user_agent,
            status="success",
            failure_reason=None
        )

        db.add(history)
        db.commit()

        return {
            "status": "success",
            "message": "Admin login successful",
            "role": "admin",
            "user": {
                "id": admin.id,
                "name": admin.name,
                "email": admin.email
            }
        }

    user = db.query(User).filter(
        User.email == email
    ).first()

    if not user:
        history = LoginHistory(
            user_id=None,
            email=email,
            ip_address=client_ip,
            user_agent=user_agent,
            status="failed",
            failure_reason="Invalid email or password"
        )

        db.add(history)
        db.commit()

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if user.status != "active":
        history = LoginHistory(
            user_id=user.id,
            email=user.email,
            ip_address=client_ip,
            user_agent=user_agent,
            status="failed",
            failure_reason="Account is deactivated"
        )

        db.add(history)
        db.commit()

        raise HTTPException(
            status_code=403,
            detail="Your account has been deactivated. Please contact the administrator."
        )

    if not pwd_context.verify(
        user_data.password,
        user.password_hash
    ):
        history = LoginHistory(
            user_id=user.id,
            email=user.email,
            ip_address=client_ip,
            user_agent=user_agent,
            status="failed",
            failure_reason="Invalid email or password"
        )

        db.add(history)
        db.commit()

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    history = LoginHistory(
        user_id=user.id,
        email=user.email,
        ip_address=client_ip,
        user_agent=user_agent,
        status="success",
        failure_reason=None
    )

    db.add(history)
    db.commit()

    return {
        "status": "success",
        "message": "Login successful",
        "role": "user",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "status": user.status
        }
    }


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.email == payload.email
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="No account found with this email."
        )

    otp_code = generate_otp()

    expires_at = (
        datetime.now(timezone.utc)
        + timedelta(minutes=OTP_VALID_MINUTES)
    )

    db.query(PasswordResetOTP).filter(
        PasswordResetOTP.email == payload.email
    ).delete()

    otp_entry = PasswordResetOTP(
        email=payload.email,
        otp_code=otp_code,
        expires_at=expires_at,
    )

    db.add(otp_entry)
    db.commit()

    send_otp_email(
        payload.email,
        otp_code
    )

    return {
        "message": "OTP sent to your email."
    }


@router.post("/verify-otp")
def verify_otp(
    payload: VerifyOtpRequest,
    db: Session = Depends(get_db)
):
    otp_entry = (
        db.query(PasswordResetOTP)
        .filter(
            PasswordResetOTP.email == payload.email
        )
        .order_by(
            PasswordResetOTP.created_at.desc()
        )
        .first()
    )

    if not otp_entry:
        raise HTTPException(
            status_code=400,
            detail="Please request a new OTP."
        )

    if datetime.now(timezone.utc) > otp_entry.expires_at.replace(
        tzinfo=timezone.utc
    ):
        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please request a new one."
        )

    if otp_entry.otp_code != payload.otp:
        raise HTTPException(
            status_code=400,
            detail="Invalid OTP."
        )

    otp_entry.is_verified = True

    db.commit()

    return {
        "message": "OTP verified successfully."
    }


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    otp_entry = (
        db.query(PasswordResetOTP)
        .filter(
            PasswordResetOTP.email == payload.email
        )
        .order_by(
            PasswordResetOTP.created_at.desc()
        )
        .first()
    )

    if not otp_entry or not otp_entry.is_verified:
        raise HTTPException(
            status_code=400,
            detail="OTP verification required."
        )

    if datetime.now(timezone.utc) > otp_entry.expires_at.replace(
        tzinfo=timezone.utc
    ):
        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please request a new one."
        )

    user = db.query(User).filter(
        User.email == payload.email
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="No account found with this email."
        )

    user.password_hash = pwd_context.hash(
        payload.new_password
    )

    db.add(user)

    db.delete(otp_entry)
    db.commit()

    return {
        "message": "Password changed successfully."
    }

