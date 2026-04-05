"""
font_utils.py — Security-hardened font validation, storage, and registration.

Security measures implemented:
  1. Magic byte check     — reject non-TTF/OTF binary files
  2. fontTools parse      — deep validation; malformed fonts raise exception
  3. Variable font detect — flag but don't crash; warn user
  4. UUID storage path    — original filename never used on disk
  5. Per-user directory   — uploads/fonts/{user_id}/
  6. Namespaced RL name   — font_u{user_id}_{uuid8} prevents cross-user collision
  7. Size limit           — 1 MB per font file
  8. Count limit          — 8 fonts per user
  9. Lazy registration    — register in ReportLab only when generating PDF
  10. Safe path join      — confirm final path is inside user dir
"""

import os
import uuid
from pathlib import Path
from typing import Optional

from fontTools.ttLib import TTFont as _TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLTTFont

# ── Limits ────────────────────────────────────────────────────────────────────
MAX_FONT_SIZE_BYTES = 1 * 1024 * 1024   # 1 MB per file
MAX_FONTS_PER_USER  = 8
FONTS_BASE_DIR      = Path("uploads/fonts")

# ── Allowed magic bytes ───────────────────────────────────────────────────────
# TTF:  \x00\x01\x00\x00  or  \x00\x01\x00\x00
# OTF:  OTTO
# TTC:  ttcf  (font collection — we reject these)
VALID_MAGIC = {b'\x00\x01\x00\x00', b'true', b'typ1', b'OTTO'}


# ── CSS weight names ──────────────────────────────────────────────────────────
WEIGHT_NAMES = {
    100: "Thin",
    200: "ExtraLight",
    300: "Light",
    400: "Regular",
    500: "Medium",
    600: "SemiBold",
    700: "Bold",
    800: "ExtraBold",
    900: "Black",
}

CSS_WEIGHT_MAP = {v.lower(): k for k, v in WEIGHT_NAMES.items()}
CSS_WEIGHT_MAP.update({
    "hairline": 100, "ultralight": 200, "demibold": 600,
    "extrabold": 800, "ultrabold": 800, "heavy": 900, "ultra": 900,
})


def user_font_dir(user_id: int) -> Path:
    p = FONTS_BASE_DIR / str(user_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_path(user_id: int, filename: str) -> Path:
    """Return an absolute path guaranteed to be inside the user's font dir."""
    base = user_font_dir(user_id).resolve()
    target = (base / filename).resolve()
    if not str(target).startswith(str(base)):
        raise ValueError("Path traversal detected")
    return target


# ── Step 1: magic byte check ──────────────────────────────────────────────────
def check_magic_bytes(data: bytes) -> None:
    if len(data) < 4:
        raise ValueError("File too small to be a font")
    magic = data[:4]
    if magic == b'ttcf':
        raise ValueError("Font collections (.ttc) are not supported. Upload individual .ttf files.")
    if magic not in VALID_MAGIC:
        raise ValueError(f"Not a valid TTF/OTF font file (bad magic bytes: {magic!r})")


# ── Step 2: deep parse with fontTools ─────────────────────────────────────────
def parse_and_inspect(data: bytes) -> dict:
    """
    Parse the font, extract metadata, detect variable fonts.
    Returns a dict with family, subfamily, weight, is_italic, is_variable.
    Raises ValueError on any parse error.
    """
    import io
    try:
        tt = _TTFont(file=io.BytesIO(data), lazy=True)
    except Exception as e:
        raise ValueError(f"Font parsing failed — file may be corrupt or malicious: {e}")

    # Check for variable font axes (fvar table)
    is_variable = "fvar" in tt

    # Extract name table entries
    names = {}
    name_table = tt.get("name")
    if name_table:
        for rec in name_table.names:
            try:
                text = rec.toUnicode()
            except Exception:
                continue
            names[rec.nameID] = text

    family   = names.get(1, "Unknown")   # nameID 1 = Font Family
    subfamily = names.get(2, "Regular")  # nameID 2 = Font Subfamily (Regular/Bold/Italic/Bold Italic)
    full_name = names.get(4, f"{family} {subfamily}")

    # Preferred family/subfamily (nameIDs 16/17) override if present
    if 16 in names: family    = names[16]
    if 17 in names: subfamily = names[17]

    # Derive weight from OS/2 table
    weight = 400
    is_italic = False
    os2 = tt.get("OS/2")
    if os2:
        weight    = getattr(os2, "usWeightClass", 400)
        fs_select = getattr(os2, "fsSelection",   0)
        is_italic = bool(fs_select & 0x01)

    # Also check subfamily name as fallback
    sub_lower = subfamily.lower()
    if not is_italic and ("italic" in sub_lower or "oblique" in sub_lower):
        is_italic = True

    # Map weight from subfamily keyword if OS/2 is missing/wrong
    if weight == 400:
        for kw, w in CSS_WEIGHT_MAP.items():
            if kw in sub_lower:
                weight = w
                break

    tt.close()

    return {
        "family_name":   family,
        "variant_name":  subfamily,
        "weight":        weight,
        "is_italic":     is_italic,
        "is_variable":   is_variable,
        "full_name":     full_name,
    }


# ── Step 3: save to disk safely ───────────────────────────────────────────────
def save_font_file(user_id: int, data: bytes) -> Path:
    """Save raw bytes to a UUID-named file in the user's isolated directory."""
    uid = uuid.uuid4().hex[:12]
    filename = f"{uid}.ttf"
    dest = _safe_path(user_id, filename)
    dest.write_bytes(data)
    return dest


# ── Step 4: build namespaced ReportLab name ───────────────────────────────────
def make_reportlab_name(user_id: int) -> str:
    """Unique, collision-proof name for pdfmetrics registry."""
    return f"font_u{user_id}_{uuid.uuid4().hex[:8]}"


# ── Step 5: register font in ReportLab (lazy, idempotent) ─────────────────────
def ensure_font_registered(reportlab_name: str, file_path: Optional[str]) -> None:
    """Register the font in ReportLab if not already registered.
    For built-in fonts (file_path=None) this is a no-op since they're always available.
    """
    if file_path is None:
        return  # built-in ReportLab font — always registered
    try:
        registered = pdfmetrics.getRegisteredFontNames()
    except Exception:
        registered = []
    if reportlab_name not in registered:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Font file missing: {file_path}")
        pdfmetrics.registerFont(RLTTFont(reportlab_name, file_path))


# ── Validation entry point (called by the upload endpoint) ────────────────────
def validate_and_inspect_font(data: bytes, original_filename: str) -> dict:
    """
    Full security pipeline. Call before writing anything to disk.
    Returns metadata dict on success, raises ValueError on any problem.
    """
    # Size check
    if len(data) > MAX_FONT_SIZE_BYTES:
        raise ValueError(f"Font file too large ({len(data)//1024} KB). Max is {MAX_FONT_SIZE_BYTES//1024//1024} MB.")

    # Extension hint (not trusted for security, just UX)
    ext = Path(original_filename).suffix.lower()
    if ext not in (".ttf", ".otf"):
        raise ValueError("Only .ttf and .otf fonts are accepted.")

    # Magic bytes (first security gate)
    check_magic_bytes(data)

    # Deep parse (second security gate)
    meta = parse_and_inspect(data)

    return meta


# ── Delete font file safely ───────────────────────────────────────────────────
def delete_font_file(file_path: str) -> None:
    try:
        p = Path(file_path)
        if p.exists():
            p.unlink()
    except Exception:
        pass  # log but don't crash