"""
routers/user_fonts.py

Endpoints:
  POST   /api/user-fonts/upload        Upload a TTF/OTF font (auth required)
  GET    /api/user-fonts/              List user's fonts (grouped by family)
  GET    /api/user-fonts/{id}/file     Stream the font file (auth-gated, for @font-face)
  DELETE /api/user-fonts/{id}          Soft-delete a font

Security:
  - Every endpoint requires JWT auth
  - Font files served through authenticated endpoint only (NOT static mount)
  - Per-user storage isolation (uploads/fonts/{user_id}/)
  - File size + count limits enforced before writing to disk
  - fontTools validation before accepting any file
  - Namespaced ReportLab names prevent cross-user registry collisions
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
import aiosqlite
import json
from pathlib import Path

from database import DB_PATH, get_user_font_usage
from auth_utils import get_current_user
from font_utils import (
    validate_and_inspect_font,
    save_font_file,
    make_reportlab_name,
    delete_font_file,
    MAX_FONTS_PER_USER,
    MAX_FONT_SIZE_BYTES,
    WEIGHT_NAMES,
)

router = APIRouter()

# ── Upload ────────────────────────────────────────────────────────────────────
@router.post("/upload")
async def upload_user_font(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    user_id = current_user["id"]
    data = await file.read()

    # ── Security: validate before touching disk ──────────────────────────────
    try:
        meta = validate_and_inspect_font(data, file.filename or "font.ttf")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # ── Enforce per-user limits ──────────────────────────────────────────
        usage = await get_user_font_usage(db, user_id)
        if usage["count"] >= MAX_FONTS_PER_USER:
            raise HTTPException(
                status_code=400,
                detail=f"Font limit reached ({MAX_FONTS_PER_USER} fonts per user). Delete some fonts first."
            )
        if usage["bytes"] + len(data) > MAX_FONTS_PER_USER * MAX_FONT_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="Total font storage limit exceeded.")

        # ── Check for exact duplicate (same family + variant for this user) ──
        async with db.execute(
            "SELECT id FROM user_fonts WHERE user_id=? AND family_name=? AND variant_name=? AND is_deleted=0",
            (user_id, meta["family_name"], meta["variant_name"])
        ) as c:
            existing = await c.fetchone()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"You already have '{meta['family_name']} {meta['variant_name']}' uploaded. Delete it first to replace."
            )

        # ── Save file to disk (UUID-named, inside user dir) ──────────────────
        file_path = save_font_file(user_id, data)
        rl_name   = make_reportlab_name(user_id)

        # ── Persist to database ──────────────────────────────────────────────
        await db.execute(
            """INSERT INTO user_fonts
               (user_id, family_name, variant_name, weight, is_italic,
                file_path, reportlab_name, file_size, is_variable)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                user_id,
                meta["family_name"],
                meta["variant_name"],
                meta["weight"],
                1 if meta["is_italic"] else 0,
                str(file_path),
                rl_name,
                len(data),
                1 if meta["is_variable"] else 0,
            )
        )
        await db.commit()

        async with db.execute("SELECT last_insert_rowid() as id") as c:
            row = await c.fetchone()
            font_id = row["id"]

    return {
        "id":           font_id,
        "family_name":  meta["family_name"],
        "variant_name": meta["variant_name"],
        "weight":       meta["weight"],
        "is_italic":    meta["is_italic"],
        "is_variable":  meta["is_variable"],
        "warning": (
            "This is a variable font. Weight selection is not available — "
            "it will render at its default weight in PDFs."
        ) if meta["is_variable"] else None,
    }


# ── List fonts (grouped by family) ───────────────────────────────────────────
@router.get("/")
async def list_user_fonts(current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT id, family_name, variant_name, weight, is_italic,
                      is_variable, file_size, created_at
               FROM user_fonts
               WHERE user_id=? AND is_deleted=0
               ORDER BY family_name, weight, is_italic""",
            (user_id,)
        ) as c:
            rows = await c.fetchall()

    # Group by family
    families: dict[str, list] = {}
    for r in rows:
        r = dict(r)
        fam = r["family_name"]
        r["weight_name"] = WEIGHT_NAMES.get(r["weight"], "Regular")
        if fam not in families:
            families[fam] = []
        families[fam].append(r)

    return {
        "families": [
            {"family_name": fam, "variants": variants}
            for fam, variants in sorted(families.items())
        ],
        "total_count": len(rows),
    }


# ── Serve font file (AUTH-GATED — never use static mount) ─────────────────────
@router.get("/{font_id}/file")
async def serve_font_file(font_id: int, current_user=Depends(get_current_user)):
    """
    Stream the TTF file to the browser for @font-face loading.
    SECURITY: Only the owning user can fetch their own font files.
    """
    user_id = current_user["id"]
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT file_path, family_name, variant_name FROM user_fonts "
            "WHERE id=? AND user_id=? AND is_deleted=0",
            (font_id, user_id)
        ) as c:
            row = await c.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Font not found")

    file_path = Path(row["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Font file missing from storage")

    # Additional path-traversal guard: confirm path is inside user's font dir
    from font_utils import FONTS_BASE_DIR
    user_base = (FONTS_BASE_DIR / str(user_id)).resolve()
    if not str(file_path.resolve()).startswith(str(user_base)):
        raise HTTPException(status_code=403, detail="Access denied")

    def font_stream():
        with open(file_path, "rb") as f:
            while chunk := f.read(64 * 1024):
                yield chunk

    fname = f"{row['family_name']}_{row['variant_name']}.ttf".replace(" ", "_")
    return StreamingResponse(
        font_stream(),
        media_type="font/ttf",
        headers={
            "Content-Disposition": f'inline; filename="{fname}"',
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        }
    )


# ── Delete (soft) ─────────────────────────────────────────────────────────────
@router.delete("/{font_id}")
async def delete_user_font(font_id: int, current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT file_path FROM user_fonts WHERE id=? AND user_id=? AND is_deleted=0",
            (font_id, user_id)
        ) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Font not found")

        # Soft delete — keep file for any in-progress PDF jobs
        await db.execute(
            "UPDATE user_fonts SET is_deleted=1 WHERE id=?", (font_id,)
        )
        await db.commit()

    # Schedule hard delete (in production, use a background task/cron)
    # For now, delete immediately since no job tracking per font yet
    delete_font_file(row["file_path"])

    return {"message": "Font deleted"}


# ── Usage stats ───────────────────────────────────────────────────────────────
@router.get("/usage")
async def font_usage(current_user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        usage = await get_user_font_usage(db, current_user["id"])
    return {
        "count":       usage["count"],
        "max_count":   MAX_FONTS_PER_USER,
        "bytes":       usage["bytes"],
        "max_bytes":   MAX_FONTS_PER_USER * MAX_FONT_SIZE_BYTES,
        "count_pct":   round(usage["count"] / MAX_FONTS_PER_USER * 100),
        "storage_pct": round(usage["bytes"] / (MAX_FONTS_PER_USER * MAX_FONT_SIZE_BYTES) * 100),
    }