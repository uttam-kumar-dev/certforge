from fastapi import APIRouter
from fonts import FONT_REGISTRY, get_font_names
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

router = APIRouter()

FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")

def register_custom_fonts():
    """Called on startup — registers any TTF fonts listed in FONT_REGISTRY."""
    os.makedirs(FONTS_DIR, exist_ok=True)
    for display_name, entry in FONT_REGISTRY.items():
        ttf = entry.get("ttf")
        if not ttf:
            continue
        ttf_path = os.path.join(FONTS_DIR, ttf)
        if not os.path.exists(ttf_path):
            print(f"[fonts] WARNING: TTF file not found: {ttf_path} (skipping '{display_name}')")
            continue
        rl_name = entry["reportlab"]
        try:
            pdfmetrics.registerFont(TTFont(rl_name, ttf_path))
            print(f"[fonts] Registered: '{display_name}' → {rl_name} ({ttf})")
        except Exception as e:
            print(f"[fonts] ERROR registering '{display_name}': {e}")

@router.get("/")
async def list_fonts():
    """
    Returns the list of available font display names for the frontend dropdown.
    Only returns fonts whose TTF file exists (or built-in fonts with ttf=None).
    """
    available = []
    os.makedirs(FONTS_DIR, exist_ok=True)
    for display_name, entry in FONT_REGISTRY.items():
        ttf = entry.get("ttf")
        if ttf is None:
            # Built-in ReportLab font — always available
            available.append(display_name)
        else:
            ttf_path = os.path.join(FONTS_DIR, ttf)
            if os.path.exists(ttf_path):
                available.append(display_name)
    return {"fonts": available}