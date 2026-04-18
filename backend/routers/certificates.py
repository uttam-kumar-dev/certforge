from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, Body
from fastapi.responses import FileResponse, JSONResponse
import aiosqlite
import aiofiles
import json
import os
import uuid
import csv
import zipfile
import io
import base64
from typing import Optional
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from database import DB_PATH
from auth_utils import get_current_user
from fonts import get_reportlab_font
from font_utils import ensure_font_registered

router = APIRouter()


# ── Font resolution: system fonts + per-user uploaded fonts ──────────────────
def resolve_font_for_pdf(field: dict, user_font_map: dict) -> str:
    """
    Resolve the correct ReportLab font name for a field.
    user_font_map: { "FamilyName|weight|italic": reportlab_name }
    Falls back to system fonts if not found in user map.
    """
    family  = field.get("font_family", "Helvetica")
    bold    = field.get("font_bold",   False)
    italic  = field.get("font_italic", False)
    weight  = field.get("font_weight", 700 if bold else 400)

    # Try exact user font match: family + weight + italic
    key_exact = f"{family}|{weight}|{int(italic)}"
    if key_exact in user_font_map:
        rl_name = user_font_map[key_exact]["reportlab_name"]
        fp      = user_font_map[key_exact]["file_path"]
        ensure_font_registered(rl_name, fp)
        return rl_name

    # Try family + bold-equivalent weight
    if bold:
        for w in [700, 600, 800, 900]:
            k = f"{family}|{w}|{int(italic)}"
            if k in user_font_map:
                rl_name = user_font_map[k]["reportlab_name"]
                fp      = user_font_map[k]["file_path"]
                ensure_font_registered(rl_name, fp)
                return rl_name

    # Try family + any weight (ignore italic)
    for key, entry in user_font_map.items():
        if key.startswith(f"{family}|"):
            ensure_font_registered(entry["reportlab_name"], entry["file_path"])
            return entry["reportlab_name"]

    # Fall back to system/built-in fonts
    return get_reportlab_font(family, bold=bold, italic=italic)


def draw_text_field(c_obj, field, value, page_w_pt, page_h_pt, user_font_map):
    """Draw a single text field onto the PDF canvas."""
    x_pt      = (field["x"]      / 100.0) * page_w_pt
    field_w   = (field["width"]  / 100.0) * page_w_pt
    field_h   = (field["height"] / 100.0) * page_h_pt
    field_top = (field["y"]      / 100.0) * page_h_pt
    # PDF y is bottom-up
    y_pt      = page_h_pt - field_top - field_h

    font_size = field.get("font_size", 24)
    color     = field.get("color",     "#000000")
    alignment = field.get("alignment", "center")

    font_name = resolve_font_for_pdf(field, user_font_map)

    try:
        hx = color.lstrip("#")
        r, g, b = (int(hx[i:i+2], 16) / 255.0 for i in (0, 2, 4))
        c_obj.setFillColorRGB(r, g, b)
    except Exception:
        c_obj.setFillColorRGB(0, 0, 0)

    c_obj.setFont(font_name, font_size)

    text    = str(value)
    text_y  = y_pt + field_h / 2 - font_size / 3

    if alignment == "center":
        c_obj.drawCentredString(x_pt + field_w / 2, text_y, text)
    elif alignment == "right":
        c_obj.drawRightString(x_pt + field_w, text_y, text)
    else:
        c_obj.drawString(x_pt, text_y, text)


def draw_text_field_pil(draw, field, value, img_w_px, img_h_px):
    """Draw a single text field onto a PIL Image."""
    x_px      = (field["x"]      / 100.0) * img_w_px
    field_w   = (field["width"]  / 100.0) * img_w_px
    field_top = (field["y"]      / 100.0) * img_h_px
    field_h   = (field["height"] / 100.0) * img_h_px
    y_px      = field_top

    font_size = field.get("font_size", 24)
    color     = field.get("color",     "#000000")
    alignment = field.get("alignment", "center")

    text = str(value)

    # Approximate font size scaling for PIL (ReportLab pts vs PIL px)
    pil_font_size = int(font_size * 1.33)

    try:
        hx = color.lstrip("#")
        rgb = tuple(int(hx[i:i+2], 16) for i in (0, 2, 4))
    except Exception:
        rgb = (0, 0, 0)

    # Calculate text position and anchor based on alignment
    text_x = x_px + field_w / 2
    text_y = y_px + field_h / 2
    anchor_map = {
        "center": "mm",
        "right": "rm",
        "left": "lm",
    }
    anchor = anchor_map.get(alignment, "mm")

    try:
        draw.text((text_x, text_y), text, fill=rgb, anchor=anchor, font=None)
    except Exception:
        # Fallback if font rendering fails
        draw.text((text_x, text_y), text, fill=rgb, anchor=anchor)


def generate_single_certificate(template_data, row_data, output_path, user_font_map=None):
    """Generate one certificate PDF. user_font_map injected for per-user fonts."""
    if user_font_map is None:
        user_font_map = {}

    fields      = template_data["fields"]
    image_path  = template_data["image_path"]
    orientation = template_data.get("orientation", "landscape")

    img = Image.open(image_path)
    img_w_px, img_h_px = img.size
    aspect = img_w_px / img_h_px

    if orientation == "landscape":
        page_h_pt = 595.28
        page_w_pt = page_h_pt * aspect
        if page_w_pt > 1000:
            page_w_pt = 841.89
            page_h_pt = page_w_pt / aspect
    else:
        page_w_pt = 595.28
        page_h_pt = page_w_pt / aspect
        if page_h_pt > 1000:
            page_h_pt = 841.89
            page_w_pt = page_h_pt * aspect

    c_obj = canvas.Canvas(output_path, pagesize=(page_w_pt, page_h_pt))
    c_obj.drawImage(image_path, 0, 0, width=page_w_pt, height=page_h_pt)

    for field in fields:
        variable = field.get("variable", "")
        value    = row_data.get(variable, False)
        if value == '':
            continue
        draw_text_field(c_obj, field, value, page_w_pt, page_h_pt, user_font_map)

    c_obj.save()


def generate_preview_image(template_data, row_data, user_font_map=None):
    """Generate a preview image (PNG) with rendered fields. Returns base64-encoded PNG."""
    if user_font_map is None:
        user_font_map = {}

    fields     = template_data["fields"]
    image_path = template_data["image_path"]

    # Open base image
    img = Image.open(image_path).convert("RGB")
    img_w_px, img_h_px = img.size

    # Create drawable
    draw = ImageDraw.Draw(img)

    # Draw each field
    for field in fields:
        variable = field.get("variable", "")
        value    = row_data.get(variable, False)
        if value == '':
            continue
        draw_text_field_pil(draw, field, value, img_w_px, img_h_px)

    # Convert to base64 PNG
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return b64


async def load_user_font_map(user_id: int) -> dict:
    """
    Load all active fonts for a user from DB into a lookup dict:
      { "FamilyName|weight|is_italic": { reportlab_name, file_path } }
    """
    font_map = {}
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT family_name, weight, is_italic, reportlab_name, file_path
               FROM user_fonts WHERE user_id=? AND is_deleted=0""",
            (user_id,)
        ) as c:
            rows = await c.fetchall()
    for r in rows:
        key = f"{r['family_name']}|{r['weight']}|{r['is_italic']}"
        font_map[key] = {
            "reportlab_name": r["reportlab_name"],
            "file_path":      r["file_path"],
        }
    return font_map


async def process_certificate_job(job_id: int, template_data: dict, csv_path: str,
                                   output_dir: str, user_id: int):
    """Background task: generate all certificates for a job."""
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                "UPDATE certificate_jobs SET status='processing' WHERE id=?", (job_id,)
            )
            await db.commit()

            # Load user fonts once for the whole batch
            user_font_map = await load_user_font_map(user_id)

            with open(csv_path, newline='', encoding='utf-8-sig') as f:
                rows = list(csv.DictReader(f))

            total = len(rows)
            await db.execute(
                "UPDATE certificate_jobs SET total_records=? WHERE id=?", (total, job_id)
            )
            await db.commit()

            os.makedirs(output_dir, exist_ok=True)
            generated = []

            for i, row in enumerate(rows):
                first_val = list(row.values())[0] if row else f"cert_{i+1}"
                safe_name = "".join(
                    c for c in str(first_val) if c.isalnum() or c in (' ', '-', '_')
                ).strip()
                safe_name = f'{i+1}_{safe_name}'
                out_path = os.path.join(output_dir, f"{safe_name or f'cert_{i+1}'}.pdf")
                generate_single_certificate(template_data, row, out_path, user_font_map)
                generated.append(out_path)

                await db.execute(
                    "UPDATE certificate_jobs SET completed_records=? WHERE id=?",
                    (i + 1, job_id)
                )
                await db.commit()

            zip_path = os.path.join(output_dir, "all_certificates.zip")
            with zipfile.ZipFile(zip_path, 'w') as zf:
                for path in generated:
                    zf.write(path, os.path.basename(path))

            await db.execute(
                "UPDATE certificate_jobs SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?",
                (job_id,)
            )
            await db.commit()

        except Exception as e:
            await db.execute(
                "UPDATE certificate_jobs SET status='failed' WHERE id=?", (job_id,)
            )
            await db.commit()
            raise e


# ── REST endpoints ────────────────────────────────────────────────────────────

@router.post("/generate")
async def start_generation(
    background_tasks: BackgroundTasks,
    template_id: int = Form(...),
    job_name: str = Form(...),
    csv_file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_templates WHERE id=? AND user_id=?",
            (template_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")
            template_data = dict(row)
            template_data["fields"] = json.loads(template_data["fields"])

    job_tag    = uuid.uuid4().hex[:8]
    csv_path   = f"uploads/certificates/job_{job_tag}.csv"
    output_dir = f"uploads/certificates/job_{job_tag}"

    async with aiofiles.open(csv_path, "wb") as f:
        await f.write(await csv_file.read())

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            """INSERT INTO certificate_jobs
               (user_id, template_id, job_name, status, csv_path, output_dir)
               VALUES (?,?,?,'pending',?,?)""",
            (current_user["id"], template_id, job_name, csv_path, output_dir)
        )
        await db.commit()
        async with db.execute("SELECT last_insert_rowid() as id") as c:
            job_id = (await c.fetchone())["id"]

    background_tasks.add_task(
        process_certificate_job,
        job_id, template_data, csv_path, output_dir, current_user["id"]
    )
    return {"job_id": job_id, "status": "pending", "message": "Generation started"}


@router.get("/jobs")
async def list_jobs(current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT j.*, t.name as template_name
               FROM certificate_jobs j
               JOIN certificate_templates t ON j.template_id=t.id
               WHERE j.user_id=? ORDER BY j.created_at DESC""",
            (current_user["id"],)
        ) as c:
            return [dict(r) for r in await c.fetchall()]


@router.get("/jobs/{job_id}")
async def get_job(job_id: int, current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_jobs WHERE id=? AND user_id=?",
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
            "SELECT * FROM certificate_jobs WHERE id=? AND user_id=?",
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


@router.get("/jobs/{job_id}/download/{filename}")
async def download_single(job_id: int, filename: str, current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_jobs WHERE id=? AND user_id=?",
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


@router.post("/preview/{template_id}")
async def preview_certificate(
    template_id: int,
    sample_data: dict = Body(...),
    current_user=Depends(get_current_user),
):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_templates WHERE id=? AND user_id=?",
            (template_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")
            template_data = dict(row)
            template_data["fields"] = json.loads(template_data["fields"])

    user_font_map = await load_user_font_map(current_user["id"])
    os.makedirs("uploads/previews", exist_ok=True)
    out_path = f"uploads/previews/preview_{template_id}_{current_user['id']}.pdf"
    generate_single_certificate(template_data, sample_data, out_path, user_font_map)
    return FileResponse(out_path, media_type="application/pdf", filename="preview.pdf")


@router.post("/preview/{template_id}/image")
async def preview_certificate_image(
    template_id: int,
    sample_data: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """Generate a rendered preview image (PNG) of the certificate."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM certificate_templates WHERE id=? AND user_id=?",
            (template_id, current_user["id"])
        ) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Template not found")
            template_data = dict(row)
            template_data["fields"] = json.loads(template_data["fields"])

    user_font_map = await load_user_font_map(current_user["id"])
    b64_image = generate_preview_image(template_data, sample_data, user_font_map)
    return JSONResponse({"image": f"data:image/png;base64,{b64_image}"})


@router.get("/stats")
async def get_stats(current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT COUNT(*) as total FROM certificate_templates WHERE user_id=?",
            (current_user["id"],)
        ) as c:
            templates_count = (await c.fetchone())["total"]
        async with db.execute(
            "SELECT COUNT(*) as total, SUM(completed_records) as certs FROM certificate_jobs WHERE user_id=?",
            (current_user["id"],)
        ) as c:
            row = await c.fetchone()
        async with db.execute(
            "SELECT COUNT(*) as total FROM certificate_jobs WHERE user_id=? AND status='completed'",
            (current_user["id"],)
        ) as c:
            completed_jobs = (await c.fetchone())["total"]

    return {
        "templates": templates_count,
        "jobs": row["total"],
        "completed_jobs": completed_jobs,
        "certificates_generated": int(row["certs"] or 0),
    }