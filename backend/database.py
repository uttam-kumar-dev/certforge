import aiosqlite
import json

DB_PATH = "certforge.db"

async def get_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS certificate_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                image_path TEXT NOT NULL,
                orientation TEXT DEFAULT 'landscape',
                width REAL DEFAULT 297,
                height REAL DEFAULT 210,
                fields TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS certificate_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                template_id INTEGER NOT NULL,
                job_name TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                total_records INTEGER DEFAULT 0,
                completed_records INTEGER DEFAULT 0,
                csv_path TEXT,
                output_dir TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (template_id) REFERENCES certificate_templates(id)
            )
        """)

        # ── User fonts table ──────────────────────────────────────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_fonts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                family_name TEXT NOT NULL,       -- display name e.g. "Roboto"
                variant_name TEXT NOT NULL,      -- e.g. "Regular", "Bold", "Thin"
                weight INTEGER DEFAULT 400,      -- 100,200,...,900
                is_italic INTEGER DEFAULT 0,     -- 0/1
                file_path TEXT NOT NULL,         -- uploads/fonts/{user_id}/{uuid}.ttf
                reportlab_name TEXT NOT NULL,    -- unique namespaced RL name
                file_size INTEGER DEFAULT 0,
                is_variable INTEGER DEFAULT 0,   -- 1 if variable font (preview only)
                is_deleted INTEGER DEFAULT 0,    -- soft delete
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        await db.commit()

async def get_user_font_usage(db, user_id: int) -> dict:
    """Return total font count and bytes for a user."""
    async with db.execute(
        "SELECT COUNT(*) as cnt, SUM(file_size) as total_bytes FROM user_fonts "
        "WHERE user_id=? AND is_deleted=0",
        (user_id,)
    ) as c:
        row = await c.fetchone()
        return {
            "count": row["cnt"] or 0,
            "bytes": row["total_bytes"] or 0,
        }