from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import SessionLocal
from models import User, LoginHistory


router = APIRouter(
    prefix="/api/admin",
    tags=["Admin"]
)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


@router.get("/users")
def get_users(
    db: Session = Depends(get_db)
):
    users = db.query(User).order_by(
        User.created_at.desc()
    ).all()

    return {
        "users": [
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "status": user.status,
                "created_at": user.created_at
            }
            for user in users
        ]
    }


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