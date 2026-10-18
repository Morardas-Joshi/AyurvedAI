from getpass import getpass

from passlib.context import CryptContext

from database import SessionLocal
from models import Admin


pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


name = input("Admin name: ").strip()
email = input("Admin email: ").strip().lower()
password = getpass("Admin password: ")


db = SessionLocal()

try:
    existing_admin = db.query(Admin).filter(
        Admin.email == email
    ).first()

    if existing_admin:
        print("Admin with this email already exists.")
    else:
        hashed_password = pwd_context.hash(password)

        admin = Admin(
            name=name,
            email=email,
            password_hash=hashed_password
        )

        db.add(admin)
        db.commit()
        db.refresh(admin)

        print("Admin created successfully.")
        print(f"Admin ID: {admin.id}")
        print(f"Admin Email: {admin.email}")

finally:
    db.close()