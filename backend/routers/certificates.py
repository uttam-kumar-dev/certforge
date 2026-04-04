from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
import aiosqlite
import aiofiles
import json
import os
import uuid
import csv
import io
import zipfile
from typing import Optional
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape, portrait
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from database import DB_PATH
from auth_utils import get_current_user

router = APIRouter()

FONT_MAP = {
    "Helvetica": "Helvetica",
    "Times-Roman": "Times-Roman",
    "Courier": "Courier",
    "Helvetica-Bold": "Helvetica-Bold",
}

def draw_text_field(c_obj, field, value, img_w_px, img_h_px, page_w_pt, page_h_pt):
    """Draw text field on PDF canvas, scaling from pixel coords to points."""
    # field positions are in percentage of image dimensions (0-100)
    x_pct = field["x"] / 100.0
    y_pct = field["y"] / 100.0
    w_pct = field["width"] / 100.0
    h_pct = field["height"] / 100.0

    x_pt = x_pct * page_w_pt
    # PDF y-axis is bottom-up; field y is top-down percentage
    field_top_pt = y_pct * page_h_pt
    field_h_pt = h_pct * page_h_pt
    field_w_pt = w_pct * page_w_pt
    y_pt = page_h_pt - field_top_pt - field_h_pt

    font_size = field.get("font_size", 24)
    font_family = field.get("font_family", "Helvetica")
    bold = field.get("font_bold", False)
    italic = field.get("font_italic", False)
    color = field.get("color", "#000000")
    alignment = field.get("alignment", "center")

    # Select font
    font_name = "Helvetica"
    if font_family in ("Helvetica", "Arial", "Sans-Serif"):
        if bold and italic:
            font_name = "Helvetica-BoldOblique"
        elif bold:
            font_name = "Helvetica-Bold"
        elif italic:
            font_name = "Helvetica-Oblique"
        else:
            font_name = "Helvetica"
    elif font_family in ("Times New Roman", "Times", "Serif"):
        if bold and italic:
            font_name = "Times-BoldItalic"
        elif bold:
            font_name = "Times-Bold"
        elif italic:
            font_name = "Times-Italic"
        else:
            font_name = "Times-Roman"
    elif font_family in ("Courier", "Monospace"):
        if bold and italic:
            font_name = "Courier-BoldOblique"
        elif bold:
            font_name = "Courier-Bold"
        elif italic:
            font_name = "Courier-Oblique"
        else:
            font_name = "Courier"

    try:
        hex_color = color.lstrip("#")
        r, g, b = tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))
        c_obj.setFillColorRGB(r, g, b)
    except:
        c_obj.setFillColorRGB(0, 0, 0)

    c_obj.setFont(font_name, font_size)

    # Draw text with alignment
    text = str(value)
    if alignment == "center":
        text_x = x_pt + field_w_pt / 2
        c_obj.drawCentredString(text_x, y_pt + field_h_pt / 2 - font_size / 3, text)
    elif alignment == "right":
        text_x = x_pt + field_w_pt
        c_obj.drawRightString(text_x, y_pt + field_h_pt / 2 - font_size / 3, text)
    else:
        c_obj.drawString(x_pt, y_pt + field_h_pt / 2 - font_size / 3, text)

def generate_single_certificate(template_data, row_data, output_path):
    """Generate a single certificate PDF."""
    fields = template_data["fields"]
    image_path = template_data["image_path"]
    orientation = template_data.get("orientation", "landscape")

    img = Image.open(image_path)
    img_w_px, img_h_px = img.size

    # PDF page size in points (1pt = 1/72 inch)
    # We'll size the PDF to match the image aspect ratio using A4 as base
    aspect = img_w_px / img_h_px
    if orientation == "landscape":
        page_h_pt = 595.28  # A4 width in pt
        page_w_pt = page_h_pt * aspect
        if page_w_pt > 1000:  # Cap max size
            page_w_pt = 841.89
            page_h_pt = page_w_pt / aspect
    else:
        page_w_pt = 595.28  # A4 width
        page_h_pt = page_w_pt / aspect
        if page_h_pt > 1000:
            page_h_pt = 841.89
            page_w_pt = page_h_pt * aspect

    c_obj = canvas.Canvas(output_path, pagesize=(page_w_pt, page_h_pt))

    # Draw background image
    c_obj.drawImage(image_path, 0, 0, width=page_w_pt, height=page_h_pt)

    # Draw each field
    for field in fields:
        variable = field.get("variable", "")
        value = row_data.get(variable, variable)
        draw_text_field(c_obj, field, value, img_w_px, img_h_px, page_w_pt, page_h_pt)

    c_obj.save()

async def process_certificate_job(job_id: int, template_data: dict, csv_path: str, output_dir: str):
    """Background task to generate all certificates."""
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                "UPDATE certificate_jobs SET status = 'processing' WHERE id = ?", (job_id,)
            )
            await db.commit()

            # Read CSV
            with open(csv_path, newline='', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                rows = list(reader)

            total = len(rows)
            await db.execute(
                "UPDATE certificate_jobs SET total_records = ? WHERE id = ?", (total, job_id)
            )
            await db.commit()

            os.makedirs(output_dir, exist_ok=True)
            generated = []

            for i, row in enumerate(rows):
                # Build filename from first column value
                first_val = list(row.values())[0] if row else f"cert_{i+1}"
                safe_name = "".join(c for c in str(first_val) if c.isalnum() or c in (' ', '-', '_')).strip()
                out_path = os.path.join(output_dir, f"{safe_name or f'cert_{i+1}'}.pdf")
                generate_single_certificate(template_data, row, out_path)
                generated.append(out_path)

                await db.execute(
                    "UPDATE certificate_jobs SET completed_records = ? WHERE id = ?",
                    (i + 1, job_id)
                )
                await db.commit()

            # Create zip archive
            zip_path = os.path.join(output_dir, "all_certificates.zip")
            with zipfile.ZipFile(zip_path, 'w') as zf:
                for path in generated:
                    zf.write(path, os.path.basename(path))

            await db.execute(
                "UPDATE certificate_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                (job_id,)
            )
            await db.commit()

        except Exception as e:
            await db.execute(
                "UPDATE certificate_jobs SET status = 'failed' WHERE id = ?", (job_id,)
            )
            await db.commit()
            raise e

@router.post("/generate")
async def start_generation(
    background_tasks: BackgroundTasks,
    template_id: int = Form(...),
    job_name: str = Form(...),
    csv_file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    # Fetch template
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_templates WHERE id = ? AND user_id = ?",
            (template_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")
            template_data = dict(row)
            template_data["fields"] = json.loads(template_data["fields"])

    # Save CSV
    job_id_str = str(uuid.uuid4())[:8]
    csv_path = f"uploads/certificates/job_{job_id_str}.csv"
    output_dir = f"uploads/certificates/job_{job_id_str}"

    async with aiofiles.open(csv_path, "wb") as f:
        content = await csv_file.read()
        await f.write(content)

    # Create job record
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            """INSERT INTO certificate_jobs
               (user_id, template_id, job_name, status, csv_path, output_dir)
               VALUES (?, ?, ?, 'pending', ?, ?)""",
            (current_user["id"], template_id, job_name, csv_path, output_dir)
        )
        await db.commit()
        async with db.execute("SELECT last_insert_rowid() as id") as c:
            job_row = await c.fetchone()
            job_id = job_row["id"]

    background_tasks.add_task(
        process_certificate_job, job_id, template_data, csv_path, output_dir
    )

    return {"job_id": job_id, "status": "pending", "message": "Generation started"}

@router.get("/jobs")
async def list_jobs(current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT j.*, t.name as template_name
               FROM certificate_jobs j
               JOIN certificate_templates t ON j.template_id = t.id
               WHERE j.user_id = ?
               ORDER BY j.created_at DESC""",
            (current_user["id"],)
        ) as c:
            rows = await c.fetchall()
            return [dict(r) for r in rows]

@router.get("/jobs/{job_id}")
async def get_job(job_id: int, current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_jobs WHERE id = ? AND user_id = ?",
            (job_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Job not found")
            return dict(row)

@router.get("/jobs/{job_id}/download")
async def download_certificates(job_id: int, current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_jobs WHERE id = ? AND user_id = ?",
            (job_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Job not found")
            job = dict(row)

    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed yet")

    zip_path = os.path.join(job["output_dir"], "all_certificates.zip")
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="Output file not found")

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"{job['job_name']}_certificates.zip"
    )

@router.post("/preview/{template_id}")
async def preview_certificate(
    template_id: int,
    sample_data: dict,
    current_user=Depends(get_current_user)
):
    """Generate a single preview PDF with sample data."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_templates WHERE id = ? AND user_id = ?",
            (template_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")
            template_data = dict(row)
            template_data["fields"] = json.loads(template_data["fields"])

    os.makedirs("uploads/previews", exist_ok=True)
    out_path = f"uploads/previews/preview_{template_id}_{current_user['id']}.pdf"
    generate_single_certificate(template_data, sample_data, out_path)
    return FileResponse(out_path, media_type="application/pdf", filename="preview.pdf")

@router.get("/stats")
async def get_stats(current_user=Depends(get_current_user)):
    """Return summary stats for the current user."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT COUNT(*) as total FROM certificate_templates WHERE user_id = ?",
            (current_user["id"],)
        ) as c:
            templates_count = (await c.fetchone())["total"]

        async with db.execute(
            "SELECT COUNT(*) as total, SUM(completed_records) as certs FROM certificate_jobs WHERE user_id = ?",
            (current_user["id"],)
        ) as c:
            row = await c.fetchone()
            jobs_count = row["total"]
            certs_count = row["certs"] or 0

        async with db.execute(
            "SELECT COUNT(*) as total FROM certificate_jobs WHERE user_id = ? AND status = 'completed'",
            (current_user["id"],)
        ) as c:
            completed_jobs = (await c.fetchone())["total"]

    return {
        "templates": templates_count,
        "jobs": jobs_count,
        "completed_jobs": completed_jobs,
        "certificates_generated": int(certs_count),
    }

@router.get("/jobs/{job_id}/download/{filename}")
async def download_single(job_id: int, filename: str, current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_jobs WHERE id = ? AND user_id = ?",
            (job_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Job not found")
            job = dict(row)

    file_path = os.path.join(job["output_dir"], filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(file_path, media_type="application/pdf", filename=filename)
