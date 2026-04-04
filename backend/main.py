from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from database import init_db
from routers import auth, templates, certificates

app = FastAPI(title="CertForge API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://frontend:3000",
        "http://localhost:8000",
        "http://backend:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads/templates", exist_ok=True)
os.makedirs("uploads/certificates", exist_ok=True)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(certificates.router, prefix="/api/certificates", tags=["certificates"])

@app.on_event("startup")
async def startup():
    await init_db()

@app.get("/")
async def root():
    return {"message": "CertForge API running"}
