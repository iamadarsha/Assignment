# Architecture — Regulatory Intel

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                          │
│                                                                 │
│   Stats strip · Filter tabs · Card feed · Document Q&A         │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTP (fetch API)
┌──────────────────▼──────────────────────────────────────────────┐
│                   NEXT.JS APP ROUTER (Server)                   │
│                                                                 │
│  GET  /api/circulars  →  getAllCirculars()                      │
│  POST /api/fetch      →  fetchAll()  [5 sources in parallel]    │
│  POST /api/process    →  processCircular() [AI pipeline]        │
│  POST /api/chat       →  chatWithDocument() [Q&A]               │
│  POST /api/review     →  setReviewed()                          │
└──────┬────────────────────────┬────────────────────────────────┘
       │                        │
┌──────▼──────┐        ┌────────▼────────────────────────────────┐
│  SQLITE DB  │        │           AI / EXTERNAL SERVICES        │
│             │        │                                         │
│ circulars   │        │  Gemini 2.5 Flash  (primary AI)         │
│   id        │        │  Groq LLaMA 3.3    (fallback AI)        │
│   source    │        │  RBI RSS           (regulator feed)     │
│   title     │        │  IFSCA JSON API    (regulator feed)     │
│   link      │        │  FATF RSS          (regulator feed)     │
│   date      │        │  MCA HTML          (WAF-gated)          │
│   summary   │        │  SEBI HTML         (WAF-gated)          │
│   relevance │        └─────────────────────────────────────────┘
│   action_*  │
│   evidence  │
│   is_pdf    │
│   pdf_path  │
│   chunks    │
│   reviewed  │
└─────────────┘
```

---

## Data Flow

### 1. Fetch Pipeline

```
POST /api/fetch
    │
    └─ fetchAll()
         │
         ├─ fetchRBI()    → RSS parse → Circular[]
         ├─ fetchIFSCA()  → JSON API  → Circular[]
         ├─ fetchMCA()    → HTML/Cheerio → Circular[] (or [] + _warning if 403)
         ├─ fetchSEBI()   → HTML/Cheerio → Circular[] (or [] + _warning if 403)
         └─ fetchFATF()   → RSS parse → Circular[]
              │
              └─ Promise.allSettled() — one source failing never blocks others
                   │
                   └─ insertCirculars() — INSERT OR IGNORE (dedup on URL/id)
                        │
                        └─ return { inserted, total, sources: SourceHealth[] }
```

**SourceHealth** per source: `"ok" | "empty" | "blocked" | "error"` — surfaced directly in UI.

---

### 2. AI Processing Pipeline

```
POST /api/process
    │
    └─ getUnprocessedCirculars(limit=5)
         │
         ├─ [if is_pdf] pdfPipeline()
         │       ├─ downloadPDF() → data/pdfs/<id>.pdf
         │       ├─ pdf-parse → extracted_text
         │       ├─ [if text empty] tesseract.js OCR → extracted_text
         │       ├─ structureText() → TextChunk[] (section + page metadata)
         │       └─ updateCircularPDF()
         │
         ├─ [if HTML] extractContent(link) → content string
         │
         └─ processCircular(circular, content, chunks?)
                 ├─ tryGemini() → AIResult
                 │       [fail] ↓
                 └─ tryGroq()  → AIResult
                         │
                         └─ updateCircularAI() → store all fields
```

---

### 3. Document Q&A Pipeline

```
POST /api/chat { circularId, question }
    │
    └─ chatWithDocument()
         │
         ├─ getCircularById() — load stored chunks
         │
         ├─ structureText() — re-chunk if no stored chunks
         │
         ├─ selectChunks(question, topK=5)
         │       keyword tokenize → score each chunk
         │       rank by: section match (×2) + word match (×1) + partial (×0.3)
         │
         ├─ build context string (max 4500 chars)
         │
         └─ callGemini() or callGroq() → parse JSON → ChatResponse
                 │
                 └─ { answer, evidence[], confidence, status }
```

---

## Component Map

### Server-side (`/lib`)

| Module | Responsibility |
|---|---|
| `db.ts` | Schema creation, migrations, all typed query functions |
| `fetchAll.ts` | Orchestrates all fetchers in `Promise.allSettled`, builds SourceHealth |
| `fetch*.ts` | One file per source — scraping, ID generation, date normalisation |
| `processCircular.ts` | System prompt, Gemini/Groq calls, JSON parse, validation |
| `chatDocument.ts` | Chunk selection, Q&A prompt, confidence override logic |
| `pdfPipeline.ts` | Download → parse → OCR → chunk |
| `structureText.ts` | Splits raw text into `TextChunk[]` with section headings and page estimates |
| `extractContent.ts` | Fetches HTML page, strips navigation/footer, returns content |

### API routes (`/app/api`)

| Route | Handler |
|---|---|
| `circulars/route.ts` | `GET` → `getAllCirculars()` |
| `fetch/route.ts` | `POST` → `fetchAll()` — returns `{ inserted, total, sources }` |
| `process/route.ts` | `POST` → process up to 5 unprocessed, return `{ processed, errors }` |
| `chat/route.ts` | `POST { circularId, question }` → `chatWithDocument()` |
| `review/route.ts` | `POST { id, reviewed }` → `setReviewed()` |

### Client (`/app/page.tsx`)

Single-file React page (~1200 lines). Key patterns:
- **Optimistic updates** — `reviewed` state updated locally before API confirms
- **Rollback on failure** — if `/api/review` returns non-200, state is reverted
- **Auto-loop processing** — `handleProcess` calls `/api/process` up to 8 times in sequence until batch returns 0
- **Source health state** — stored in `useState<SourceHealth[]>` after each fetch
- **Cross-filterable feed** — relevance filter × review filter, derived from a single `circulars[]` array

---

## Database Schema

```sql
CREATE TABLE circulars (
  id                TEXT PRIMARY KEY,     -- URL or generated hash
  source            TEXT NOT NULL,        -- RBI | IFSCA | MCA | FATF | SEBI
  title             TEXT NOT NULL,
  link              TEXT NOT NULL,
  date              TEXT DEFAULT '',
  created_at        TEXT DEFAULT (datetime('now')),

  -- HTML content
  content           TEXT,

  -- AI analysis
  summary           TEXT,
  relevance         TEXT,                 -- HIGH | MEDIUM | LOW | NOT RELEVANT
  why_it_matters    TEXT,
  action_items      TEXT,                 -- JSON array stored as text
  evidence          TEXT,                 -- JSON array stored as text

  -- PDF pipeline
  is_pdf            INTEGER DEFAULT 0,    -- 1 = PDF, 0 = HTML
  pdf_path          TEXT,
  extracted_text    TEXT,
  structured_chunks TEXT,                 -- JSON: TextChunk[]

  -- Review workflow
  reviewed          INTEGER DEFAULT 0     -- 1 = reviewed, 0 = unreviewed
);
```

**Migration strategy:** `PRAGMA table_info(circulars)` on startup, then `ALTER TABLE ADD COLUMN` for any missing columns. Safe on existing databases — no destructive migrations.

---

## Key Design Principles

### Fail isolation
`Promise.allSettled` in `fetchAll` means one WAF-blocked or errored source never prevents the others from succeeding. Each source reports its own health status independently.

### Fail-closed AI
If both Gemini and Groq fail, `processCircular` returns `null` — the circular stays in the unprocessed queue and will be retried on the next Process AI run. No silent data loss.

### Degraded mode explicit
When the Groq fallback is used for Q&A, the UI surfaces a "Fallback provider" badge on the response. Compliance staff know the answer came from a lower-priority model.

### Server-side only secrets
API keys are read from `process.env` exclusively in server-side API routes and `lib/` modules. The client bundle contains no credentials.

### Synchronous SQLite
`better-sqlite3` is synchronous — no `async/await` in the DB layer. This simplifies the code significantly in a Next.js server context where all DB access is within a single request's execution.

---

## Scaling Path

| Constraint | Current | Production fix |
|---|---|---|
| Storage | SQLite (single file) | Postgres (replace `db.ts` driver, same interface) |
| AI concurrency | Sequential per-circular | Queue (BullMQ / pg-boss) + worker pool |
| WAF-gated sources | Empty array | Playwright + residential proxy, scheduled job |
| Multi-user | Shared SQLite write | Row-level auth in Postgres + Supabase Auth |
| Q&A quality | Keyword chunk scoring | Hybrid BM25 + embeddings (pgvector) |
| PDF OCR | Tesseract.js (slow) | AWS Textract or Google Document AI |
