#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "\n${CYAN}  🏆 CertForge — Certificate Generator${NC}\n"

echo -e "${GREEN}[1/4]${NC} Installing Python dependencies..."
cd "$ROOT/backend"
pip install -r requirements.txt -q

echo -e "${GREEN}[2/4]${NC} Starting FastAPI backend on :8000..."
uvicorn main:app --reload --port 8000 --log-level warning &
BACKEND_PID=$!
for i in {1..10}; do
  sleep 1
  curl -sf http://localhost:8000/ > /dev/null 2>&1 && echo -e "    ${GREEN}✓${NC} Backend ready" && break
done

echo -e "${GREEN}[3/4]${NC} Installing Node dependencies..."
cd "$ROOT/frontend"
npm install --silent

echo -e "${GREEN}[4/4]${NC} Starting React dev server on :5173..."
npm run dev &
FRONTEND_PID=$!
sleep 2

echo -e "\n  ${GREEN}✓${NC} CertForge is running!\n"
echo -e "  🌐 App:      ${CYAN}http://localhost:5173${NC}"
echo -e "  📚 API Docs: ${CYAN}http://localhost:8000/docs${NC}\n"
echo "  Press Ctrl+C to stop"

cleanup() { kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0; }
trap cleanup INT TERM
wait
