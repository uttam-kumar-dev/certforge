from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
import aiosqlite
import aiofiles
import json
import os
import uuid
from PIL import Image
from database import DB_PATH
from auth_utils import get_current_user

router = APIRouter()

class TemplateField(BaseModel):
    id: str
    variable: str
    x: float
    y: float
    width: float
    height: float
    font_family: str = "Helvetica"
    font_size: float = 24
    font_bold: bool = False
    font_italic: bool = False
    color: str = "#000000"
    alignment: str = "center"

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    fields: Optional[List[TemplateField]] = None

@router.post("/upload")
async def upload_template(
    file: UploadFile = File(...),
    name: str = Form(...),
    current_user=Depends(get_current_user)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    ext = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    path = f"uploads/templates/{filename}"

    async with aiofiles.open(path, "wb") as f:
        content = await file.read()
        await f.write(content)

    # Detect orientation and dimensions from image
    img = Image.open(path)
    w, h = img.size
    # Convert pixels to mm (assuming 96dpi)
    w_mm = round(w * 25.4 / 96, 2)
    h_mm = round(h * 25.4 / 96, 2)
    orientation = "landscape" if w > h else "portrait"

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            """INSERT INTO certificate_templates
               (user_id, name, image_path, orientation, width, height, fields)
               VALUES (?, ?, ?, ?, ?, ?, '[]')""",
            (current_user["id"], name, path, orientation, w_mm, h_mm)
        )
        await db.commit()
        async with db.execute("SELECT last_insert_rowid() as id") as c:
            row = await c.fetchone()
            template_id = row["id"]

        async with db.execute("SELECT * FROM certificate_templates WHERE id = ?", (template_id,)) as c:
            tmpl = await c.fetchone()
            result = dict(tmpl)
            result["fields"] = json.loads(result["fields"])
            result["image_width_px"] = w
            result["image_height_px"] = h
            return result

@router.get("/")
async def list_templates(current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_templates WHERE user_id = ? ORDER BY created_at DESC",
            (current_user["id"],)
        ) as c:
            rows = await c.fetchall()
            result = []
            for row in rows:
                item = dict(row)
                item["fields"] = json.loads(item["fields"])
                result.append(item)
            return result

@router.get("/{template_id}")
async def get_template(template_id: int, current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_templates WHERE id = ? AND user_id = ?",
            (template_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")
            result = dict(row)
            result["fields"] = json.loads(result["fields"])
            # Get pixel dimensions from image
            try:
                img = Image.open(result["image_path"])
                result["image_width_px"] = img.size[0]
                result["image_height_px"] = img.size[1]
            except:
                result["image_width_px"] = 1000
                result["image_height_px"] = 700
            return result

@router.put("/{template_id}")
async def update_template(
    template_id: int,
    update: TemplateUpdate,
    current_user=Depends(get_current_user)
):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_templates WHERE id = ? AND user_id = ?",
            (template_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")

        fields_json = json.dumps([f.dict() for f in update.fields]) if update.fields is not None else None

        if update.name:
            await db.execute("UPDATE certificate_templates SET name = ? WHERE id = ?",
                             (update.name, template_id))
        if fields_json is not None:
            await db.execute("UPDATE certificate_templates SET fields = ? WHERE id = ?",
                             (fields_json, template_id))
        await db.commit()

        async with db.execute("SELECT * FROM certificate_templates WHERE id = ?", (template_id,)) as c:
            updated = await c.fetchone()
            result = dict(updated)
            result["fields"] = json.loads(result["fields"])
            return result

@router.delete("/{template_id}")
async def delete_template(template_id: int, current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_templates WHERE id = ? AND user_id = ?",
            (template_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")

        # Delete image file
        try:
            os.remove(row["image_path"])
        except:
            pass

        await db.execute("DELETE FROM certificate_templates WHERE id = ?", (template_id,))
        await db.commit()
        return {"message": "Template deleted"}
