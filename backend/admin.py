from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Admin, LoginHistory, PasswordResetOTP, User


router = APIRouter(
    prefix="/api/admin",
    tags=["Admin"]
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


class AdminUserBase(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    email: EmailStr

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name is required")
        return value

    @field_validator("email")
    @classmethod
    def email_length(cls, value: str) -> str:
        value = value.strip().lower()
        if len(value) > 50:
            raise ValueError("Email must be 50 characters or fewer")
        return value


class AdminUserCreate(AdminUserBase):
    password: str = Field(min_length=8, max_length=128)
    status: Literal["active", "inactive"] = "active"


class AdminUserUpdate(AdminUserBase):
    pass


class AdminPasswordReset(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


def _email_taken(db: Session, email: str, exclude_user_id: int | None = None) -> bool:
    if db.query(Admin.id).filter(Admin.email == email).first():
        return True
    query = db.query(User.id).filter(User.email == email)
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return query.first() is not None


def _user_dict(user: User, last_login: datetime | None = None) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "status": user.status,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "last_login": last_login,
    }


@router.get("/users")
def get_users(
    db: Session = Depends(get_db)
):
    users = db.query(User).order_by(
        User.created_at.desc()
    ).all()

    last_logins = dict(
        db.query(LoginHistory.user_id, func.max(LoginHistory.login_at))
        .filter(LoginHistory.status == "success", LoginHistory.user_id.isnot(None))
        .group_by(LoginHistory.user_id)
        .all()
    )

    return {
        "users": [_user_dict(user, last_logins.get(user.id)) for user in users]
    }


@router.post("/users", status_code=201)
def create_user(payload: AdminUserCreate, db: Session = Depends(get_db)):
    if _email_taken(db, payload.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=pwd_context.hash(payload.password),
        terms_accepted=False,
        status=payload.status,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"status": "success", "message": "User added successfully.", "user": _user_dict(user)}


@router.put("/users/{user_id}")
def update_user(user_id: int, payload: AdminUserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if _email_taken(db, payload.email, exclude_user_id=user_id):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user.name = payload.name
    user.email = payload.email
    user.updated_at = func.current_timestamp()
    db.commit()
    db.refresh(user)
    return {"status": "success", "message": "User updated successfully.", "user": _user_dict(user)}


@router.post("/users/{user_id}/reset-password")
def reset_user_password(user_id: int, payload: AdminPasswordReset, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = pwd_context.hash(payload.new_password)
    user.updated_at = func.current_timestamp()
    db.commit()
    return {"status": "success", "message": f"Password reset for {user.name}."}


@router.patch("/users/{user_id}/status")
def update_user_status(
    user_id: int,
    data: dict,
    db: Session = Depends(get_db)
):
    new_status = data.get("status")

    if new_status not in ["active", "inactive"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid status"
        )

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    user.status = new_status
    user.updated_at = func.current_timestamp()

    db.commit()
    db.refresh(user)

    return {
        "status": "success",
        "message": "User status updated",
        "user": {
            "id": user.id,
            "status": user.status
        }
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    db.query(LoginHistory).filter(
        LoginHistory.user_id == user_id
    ).delete(
        synchronize_session=False
    )

    db.query(PasswordResetOTP).filter(
        PasswordResetOTP.email == user.email
    ).delete(
        synchronize_session=False
    )

    db.delete(user)
    db.commit()

    return {
        "status": "success",
        "message": "User deleted successfully"
    }


@router.get("/login-history")
def get_login_history(
    db: Session = Depends(get_db)
):
    history = db.query(
        LoginHistory
    ).order_by(
        LoginHistory.login_at.desc()
    ).all()

    return {
        "history": [
            {
                "id": item.id,
                "user_id": item.user_id,
                "email": item.email,
                "login_at": item.login_at,
                "ip_address": item.ip_address,
                "user_agent": item.user_agent,
                "status": item.status,
                "failure_reason": item.failure_reason
            }
            for item in history
        ]
    }


@router.delete("/login-history")
def clear_login_history(
    older_than_days: int = Query(ge=1, le=3650),
    db: Session = Depends(get_db)
):
    cutoff = datetime.now() - timedelta(days=older_than_days)
    deleted = db.query(LoginHistory).filter(
        LoginHistory.login_at < cutoff
    ).delete(synchronize_session=False)
    db.commit()
    return {
        "status": "success",
        "deleted": deleted,
        "message": f"Deleted {deleted} login record{'s' if deleted != 1 else ''} older than {older_than_days} days."
    }
