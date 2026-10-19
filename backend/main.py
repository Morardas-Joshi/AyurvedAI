from chat import router as chat_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine
from auth import router as auth_router
from admin import router as admin_router


app = FastAPI(title="AyurvedAI API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(chat_router)

from identify import router as identify_router
app.include_router(identify_router)


@app.get("/")
def root():
    return {
        "message": "AyurvedAI Backend is running"
    }


@app.get("/db-test")
def database_test():
    try:
        with engine.connect() as connection:
            return {
                "status": "success",
                "message": "PostgreSQL connected successfully"
            }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }