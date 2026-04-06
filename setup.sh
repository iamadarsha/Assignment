#!/bin/bash
# ─── Regulatory Intel — Quick Setup ───────────────────────────────────────────
# Run once after cloning: bash setup.sh
# ──────────────────────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Colour

echo ""
echo "  Regulatory Intel — Glomopay"
echo "  ─────────────────────────────"
echo ""

# ── 1. Node version check ────────────────────────────────────────────────────
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}✗ Node.js 18+ required. Current: $(node -v 2>/dev/null || echo 'not found')${NC}"
  echo "  Install from https://nodejs.org"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"

# ── 2. Install dependencies ──────────────────────────────────────────────────
echo -e "  ${YELLOW}→${NC} Installing dependencies..."
npm install --silent
echo -e "  ${GREEN}✓${NC} Dependencies installed"

# ── 3. Set up .env.local ─────────────────────────────────────────────────────
if [ -f .env.local ]; then
  echo -e "  ${GREEN}✓${NC} .env.local already exists — skipping"
else
  cp .env.local.example .env.local
  echo ""
  echo -e "  ${YELLOW}⚠ API keys required${NC}"
  echo ""
  echo "  Edit .env.local and add your keys:"
  echo ""
  echo "    GEMINI_API_KEY   → https://aistudio.google.com/app/apikey"
  echo "    GROQ_API_KEY     → https://console.groq.com/keys"
  echo ""
  echo "  Both are free — no credit card needed."
  echo ""

  # Interactive prompt
  read -p "  Enter your GEMINI_API_KEY (or press Enter to add it manually later): " GEMINI_KEY
  if [ -n "$GEMINI_KEY" ]; then
    sed -i.bak "s/your_gemini_api_key_here/$GEMINI_KEY/" .env.local && rm -f .env.local.bak
    echo -e "  ${GREEN}✓${NC} GEMINI_API_KEY set"
  fi

  read -p "  Enter your GROQ_API_KEY (or press Enter to add it manually later): " GROQ_KEY
  if [ -n "$GROQ_KEY" ]; then
    sed -i.bak "s/your_groq_api_key_here/$GROQ_KEY/" .env.local && rm -f .env.local.bak
    echo -e "  ${GREEN}✓${NC} GROQ_API_KEY set"
  fi
fi

# ── 4. Create data directories ───────────────────────────────────────────────
mkdir -p data/pdfs
echo -e "  ${GREEN}✓${NC} Data directories ready"

# ── 5. Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}Setup complete.${NC} Start the app with:"
echo ""
echo "    npm run dev"
echo ""
echo "  Then open http://localhost:3000"
echo "  → Click 'Fetch Updates' → then 'Process AI'"
echo ""
