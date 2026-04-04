# 🏆 CertForge — Certificate Generator

**CertForge** is a full-stack web app for bulk-generating personalized PDF certificates from image templates and CSV data. Built with FastAPI (Python backend), React/Vite (frontend), and SQLite, it features drag-and-drop field editing, user authentication with JWT, and real-time certificate generation with ZIP downloads. Simply upload a certificate template image, define text fields visually, prepare a CSV with your data, and generate professional certificates in seconds.

## Quick Start

**Docker:** `docker-compose up -d` then visit http://localhost:3000

**Manual:**
- Backend: `cd backend && pip install -r requirements.txt && uvicorn main:app --reload`
- Frontend: `cd frontend && npm install && npm run dev`
- API Docs: http://localhost:8000/docs

---

## Contributing

Found a bug? Have a feature idea? We'd love your help! Please:
1. **Report bugs** — [Open an issue](../../issues/new) with details and steps to reproduce
2. **Submit fixes** — Fork the repo, create a branch, and [submit a pull request](../../pulls/new)
3. **Suggest features** — Describe your idea in an issue or PR discussion

All contributions are welcome. Let's make CertForge better together! 🚀
