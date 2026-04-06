# Regulatory Intel — Glomopay

> AI-powered regulatory monitoring for a GIFT City IFSC-licensed remittance operator.

Tracks circulars from **RBI, IFSCA, MCA, FATF, and SEBI** — auto-classifies relevance to Glomopay's LRS/outward-remittance operations, extracts action items, and lets compliance staff interrogate any document in plain language.

Built as a take-home assignment for the **Glomopay Full Stack Builder** role.

---

## Features

| | |
|---|---|
| **Multi-source fetch** | RBI (RSS), IFSCA (JSON API), MCA, SEBI, FATF — parallel, fail-isolated |
| **AI relevance scoring** | HIGH / MEDIUM / LOW / NOT RELEVANT with Glomopay-specific context |
| **Action items** | Concrete compliance steps extracted from each circular |
| **Evidence packs** | Verbatim document quotes grounding every AI claim |
| **PDF pipeline** | Auto-download → pdf-parse → Tesseract OCR fallback |
| **Document Q&A** | Ask any question; get an answer with page-level citations |
| **Review tracking** | Mark circulars as reviewed; persists across sessions (SQLite-backed) |
| **Source health** | Per-source status after each fetch (ok / empty / blocked / error) |
| **Degraded mode** | Gemini 2.5 Flash → Groq LLaMA 3.3 failover; surfaced in UI |
| **Deduplication** | `INSERT OR IGNORE` on URL — no duplicate circulars ever |

---

## Quick Start

### Prerequisites

- Node.js 18+
- `GEMINI_API_KEY` — [Get one free](https://aistudio.google.com/app/apikey)
- `GROQ_API_KEY` — [Get one free](https://console.groq.com)

### Install & run

```bash
git clone <repo-url>
cd Assignment
npm install

# Add API keys
echo "GEMINI_API_KEY=your_key_here" >> .env.local
echo "GROQ_API_KEY=your_key_here" >> .env.local

npm run dev
# → http://localhost:3000
```

### First use

1. **Fetch Updates** → pulls latest circulars from all 5 sources
2. **Process AI** → runs Gemini analysis (auto-loops until all circulars are done)
3. Filter by **High** → review action items for your most urgent obligations
4. Expand any card → **Ask This Document** to interrogate the full circular

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/circulars` | `GET` | All stored circulars with AI fields |
| `/api/fetch` | `POST` | Scrape all 5 sources, insert new circulars |
| `/api/process` | `POST` | AI-analyse next batch of unprocessed circulars |
| `/api/chat` | `POST` | `{ circularId, question }` → answer + evidence |
| `/api/review` | `POST` | `{ id, reviewed: bool }` → persist review state |

---

## Project Structure

```
app/
  page.tsx                  # Main UI — single-page React
  api/
    circulars/route.ts      # GET all circulars
    fetch/route.ts          # POST trigger scrape
    process/route.ts        # POST trigger AI analysis
    chat/route.ts           # POST document Q&A
    review/route.ts         # POST toggle reviewed flag
lib/
  db.ts                     # SQLite schema, migrations, all queries
  fetchAll.ts               # Parallel fetcher orchestrator + source health
  fetchRBI.ts               # RBI RSS scraper
  fetchIFSCA.ts             # IFSCA JSON API scraper
  fetchMCA.ts               # MCA HTML scraper (WAF-aware, graceful fallback)
  fetchSEBI.ts              # SEBI HTML scraper (WAF-aware, graceful fallback)
  fetchFATF.ts              # FATF RSS scraper
  processCircular.ts        # AI analysis — Gemini → Groq fallback
  chatDocument.ts           # Document Q&A with chunk scoring + evidence
  structureText.ts          # Text → structured chunks with section/page metadata
  extractContent.ts         # HTML → clean text extraction
  pdfPipeline.ts            # PDF download + parse + OCR
data/
  circulars.db              # SQLite DB (auto-created on first run)
  pdfs/                     # Downloaded PDFs (auto-created)
```

---

## Deployment

### Vercel (one-command)

```bash
npx vercel
# Add GEMINI_API_KEY + GROQ_API_KEY as environment variables in dashboard
```

> SQLite data won't persist across Vercel deployments (ephemeral filesystem).
> See [ARCHITECTURE.md](./ARCHITECTURE.md) for Postgres migration path.

### Self-hosted Node.js

```bash
npm run build && npm start
# Data persists in ./data/circulars.db — back this up or mount as volume
```

### Docker

```bash
docker build -t regulatory-intel .
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your_key \
  -e GROQ_API_KEY=your_key \
  -v $(pwd)/data:/app/data \
  regulatory-intel
```

---

## Known Limitations

- **MCA & SEBI** — both sit behind Akamai/Cloudflare WAFs that block server-side requests. Fetchers degrade gracefully and surface block status in the UI. Production fix: scheduled Playwright job. See [HANDOVER.md](./HANDOVER.md).
- **Single-writer SQLite** — sufficient for prototype; migrate to Postgres for multi-user or concurrent writes.
- **Previously-processed circulars** — prompt improvements apply only to new or re-processed circulars. A `/api/process?force=true` flag is the planned fix.

---

## Documentation

| File | Contents |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data flow, component map |
| [TECH_STACK.md](./TECH_STACK.md) | Every technology choice with rationale |
| [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) | Problem scoping, trade-offs, what's next, 3-month roadmap |
| [HANDOVER.md](./HANDOVER.md) | Developer handover — known issues, env setup, next steps |

---

## License

MIT
