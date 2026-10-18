from pydantic import BaseModel, Field, EmailStr, field_validator


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    email: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)
    terms_accepted: bool


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str

    @field_validator("otp")
    @classmethod
    def otp_must_be_six_digits(cls, value: str) -> str:
        if not value.isdigit() or len(value) != 6:
            raise ValueError("OTP must be a 6 digit number")
        return value


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters")
        return value

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if "new_password" in info.data and value != info.data["new_password"]:
            raise ValueError("Passwords don't match")
        return value