from sqlalchemy import BigInteger, Integer, Boolean, Column, DateTime, String, Text, ForeignKey, func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    email = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    terms_accepted = Column(Boolean, nullable=False, default=False)
    status = Column(String(10), nullable=False, default="active")

    created_at = Column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp()
    )

    updated_at = Column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp()
    )


class LoginHistory(Base):
    __tablename__ = "login_history"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True
    )
    email = Column(String(50), nullable=False)

    login_at = Column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp()
    )

    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)

    status = Column(String(20), nullable=False)
    failure_reason = Column(String(255), nullable=True)

class Admin(Base):
    __tablename__ = "admins"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    email = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)

    created_at = Column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp()
    )

    updated_at = Column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp()
    )

class PasswordResetOTP(Base):
    __tablename__ = "password_reset_otps"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    otp_code = Column(String(6), nullable=False)
    is_verified = Column(Boolean, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())