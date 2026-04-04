from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
import aiosqlite
from database import DB_PATH
from auth_utils import verify_password, get_password_hash, create_access_token, get_current_user

router = APIRouter()

class UserRegister(BaseModel):
    email: str
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    username: str

@router.post("/register", response_model=UserResponse)
async def register(user: UserRegister):
    hashed = get_password_hash(user.password)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        try:
            await db.execute(
                "INSERT INTO users (email, username, hashed_password) VALUES (?, ?, ?)",
                (user.email, user.username, hashed)
            )
            await db.commit()
            async with db.execute("SELECT * FROM users WHERE email = ?", (user.email,)) as c:
                new_user = await c.fetchone()
                return dict(new_user)
        except aiosqlite.IntegrityError:
            raise HTTPException(status_code=400, detail="Email or username already registered")

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE username = ? OR email = ?",
                              (form_data.username, form_data.username)) as c:
            user = await c.fetchone()

    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect credentials")

    token = create_access_token({"sub": str(user["id"])})
    return {"access_token": token, "token_type": "bearer", "username": user["username"]}

@router.get("/me", response_model=UserResponse)
async def me(current_user=Depends(get_current_user)):
    return current_user
