# fonts.py
# Add new fonts here — the API will serve them automatically to the frontend.
# Key   = display name shown in the UI dropdown
# Value = ReportLab font name used during PDF generation
#
# Built-in font in ReportLab (System fonts):
#   Helvetica, Helvetica-Bold, Helvetica-Oblique, Helvetica-BoldOblique
#   Times-Roman, Times-Bold, Times-Italic, Times-BoldItalic
#   Courier, Courier-Bold, Courier-Oblique, Courier-BoldOblique
#   Symbol, ZapfDingbats
#
# To add a custmo TTF font:
#   1. Place the .ttf file in backend/fonts/ folder
#   2. Add an entry below with the TTF filename
#   3. Restart the backend server - it will register the font automatically

FONT_REGISTRY = {
    # ── Sans-serif ─────────────────────────────────────────────
    "Helvetica":        {"reportlab": "Helvetica",   "ttf": None},
    "Arial":            {"reportlab": "Helvetica",   "ttf": None},   # maps to Helvetica (built-in)

    # ── Serif ──────────────────────────────────────────────────
    "Times New Roman":  {"reportlab": "Times-Roman", "ttf": None},
    "Georgia":          {"reportlab": "Times-Roman", "ttf": None},   # maps to Times (built-in)

    # ── Monospace ──────────────────────────────────────────────
    "Courier":          {"reportlab": "Courier",     "ttf": None},
    "Courier New":      {"reportlab": "Courier",     "ttf": None},

    # ── Example custom TTF fonts (add .ttf to backend/fonts/) ──
    # "Roboto":         {"reportlab": "Roboto",      "ttf": "Roboto-Regular.ttf"},
    # "Open Sans":      {"reportlab": "OpenSans",    "ttf": "OpenSans-Regular.ttf"},
    # "Montserrat":     {"reportlab": "Montserrat",  "ttf": "Montserrat-Regular.ttf"},
    # "Playfair Display": {"reportlab": "PlayfairDisplay", "ttf": "PlayfairDisplay-Regular.ttf"},
    # "Lato":           {"reportlab": "Lato",        "ttf": "Lato-Regular.ttf"},
    # "Raleway":        {"reportlab": "Raleway",     "ttf": "Raleway-Regular.ttf"},
    # "Oswald":         {"reportlab": "Oswald",      "ttf": "Oswald-Regular.ttf"},
}

def get_font_names():
    """Return list of display names for the frontend dropdown."""
    return list(FONT_REGISTRY.keys())

def get_reportlab_font(display_name: str, bold: bool = False, italic: bool = False) -> str:
    """
    Resolve the correct ReportLab font name given display name + style flags.
    Falls back gracefully for built-in fonts.
    """
    entry = FONT_REGISTRY.get(display_name)
    if not entry:
        return "Helvetica"

    base = entry["reportlab"]

    # If it's a custom TTF, we registered base name only — return as-is
    if entry["ttf"]:
        return base

    # Built-in ReportLab font — resolve bold/italic variants
    VARIANTS = {
        "Helvetica": {
            (False, False): "Helvetica",
            (True,  False): "Helvetica-Bold",
            (False, True):  "Helvetica-Oblique",
            (True,  True):  "Helvetica-BoldOblique",
        },
        "Times-Roman": {
            (False, False): "Times-Roman",
            (True,  False): "Times-Bold",
            (False, True):  "Times-Italic",
            (True,  True):  "Times-BoldItalic",
        },
        "Courier": {
            (False, False): "Courier",
            (True,  False): "Courier-Bold",
            (False, True):  "Courier-Oblique",
            (True,  True):  "Courier-BoldOblique",
        },
    }
    return VARIANTS.get(base, {}).get((bold, italic), base)