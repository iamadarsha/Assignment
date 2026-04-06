# Regulatory Intel — Glomopay Compliance Monitor

An AI-powered regulatory monitoring tool that tracks circulars from RBI, IFSCA, SEBI, MCA, and FATF, summarises them in plain language, scores their relevance to Glomopay's operations, and surfaces specific action items for the compliance team.

---

## Problem Scoping

**The user:** A Glomopay compliance officer who currently spends 3–5 hours/week manually visiting five regulator websites, downloading PDFs, reading them, and deciding whether they affect LRS processing, KYC/AML controls, or IFSC licensing. The team has no structured process — it is entirely memory- and habit-driven.

**Highest-leverage pain:** Not the reading. The *triage*. Compliance teams read everything because they can't afford to miss anything. The highest-leverage intervention is an accurate, explainable relevance signal — one specific enough to Glomopay's context (outward remittances, LRS, GIFT City, FATF screening) that the team trusts it and acts on it, not just a generic AI summary.

**What I explicitly did not build:**
- Cross-document / corpus-wide RAG — out of scope for a 4–6h prototype; the marginal value is lower than getting single-document analysis right.
- Scheduled auto-ingestion (cron) — replaced with a manual "Fetch Now" trigger; scheduling is one env var and a cron job once deployed.
- Manual file upload — deliberate cut; most Glomopay-relevant circulars are published by monitored bodies. This would be sprint 2.
- Email/Slack notifications — post-MVP plumbing once the signal quality is validated.

**Key assumptions I'd validate before production:**
- That Gemini/Groq relevance scores are accurate enough to trust (measure miss rate on a gold-set of historical circulars).
- That compliance staff will actually use a web tool vs. receiving a digest email.
- That RBI/IFSCA RSS feeds stay stable (they have broken before).

---

## What's Built

| Feature | Status |
|---|---|
| Ingest: RBI (RSS), IFSCA (JSON API), MCA, SEBI, FATF | ✅ |
| Deduplication (INSERT OR IGNORE on URL as primary key) | ✅ |
| AI analysis: summary, relevance, why it matters, action items | ✅ |
| PDF download + text extraction (pdf-parse) | ✅ |
| OCR fallback for scanned PDFs (tesseract.js) | ✅ |
| Structured text chunking for section-aware prompting | ✅ |
| Gemini 2.5 Flash primary → Groq LLaMA 3.3 fallback | ✅ |
| Relevance feed with filters (High/Medium/Low + Reviewed) | ✅ |
| Per-circular AI analysis card | ✅ |
| Reviewed / unreviewed tracking | ✅ |
| Per-circular document Q&A with evidence citations | ✅ |
| "Fetch Now" + "Process AI" manual triggers | ✅ |
| Security headers (X-Frame-Options, CSP, etc.) | ✅ |
| API keys server-side only — never in client bundle | ✅ |

---

## How to Run

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
git clone <repo-url>
cd regulatory-intel

npm install

# Create your environment file
cp .env.local.example .env.local
```

Edit `.env.local` and add your API keys:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

**Get API keys:**
- Gemini: [console.cloud.google.com](https://aistudio.google.com/app/apikey) — free tier available
- Groq: [console.groq.com](https://console.groq.com) — free tier available

### Development

```bash
npm run dev
# → http://localhost:3000
```

### Production

```bash
npm run build
npm start
# → http://localhost:3000
```

### First run

1. Open http://localhost:3000
2. Click **Fetch Updates** — pulls latest circulars from all sources (RBI + IFSCA will return data; MCA/SEBI/FATF may be blocked by WAFs in their current state)
3. Click **Process AI** — runs Gemini analysis on up to 5 unprocessed circulars
4. Repeat "Process AI" until all circulars are analysed
5. Click any card to expand — summary, action items, evidence, and document Q&A

### API

| Endpoint | Method | Description |
|---|---|---|
| `/api/circulars` | GET | All stored circulars with AI fields |
| `/api/fetch` | POST | Pull latest from all sources |
| `/api/process` | POST | AI-analyse up to 5 unprocessed circulars |
| `/api/chat` | POST | Document-scoped Q&A |

**Chat example:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"circularId": "<circular-id>", "question": "What are the limits for FPI investment?"}'
```

---

## Architecture

```
Fetch layer          Storage         AI layer              UI
──────────────       ───────         ────────────────      ──────
fetchRBI  (RSS) ─┐                   extractContent   ─┐
fetchIFSCA (API)─┤  SQLite          parsePDF         ─┤   Next.js
fetchMCA  (HTML)─┼→ circulars.db  → structureText    ─┼→  React
fetchFATF (RSS) ─┤  (better-      → processCircular  ─┤   UI
fetchSEBI (HTML)─┘   sqlite3)       (Gemini→Groq)    ─┘
                                    chatDocument
```

**Data flow:**
1. `POST /api/fetch` → scrapes all sources → `INSERT OR IGNORE` into SQLite
2. `POST /api/process` → for each unprocessed circular: detect PDF → download → parse → chunk → call AI → store results
3. `POST /api/chat` → load circular's stored chunks → keyword-score for relevance → prompt AI with top chunks → return answer + citations
4. `GET /api/circulars` → frontend renders feed

---

## Design Decisions

### 1. Source strategy: RSS + JSON API over scraping

**Considered:** Playwright/Puppeteer headless browser for all sources.
**Chose:** RSS for RBI/FATF, JSON API (discovered via JS bundle inspection) for IFSCA.
**Why:** Stable, fast, no WAF issues. MCA and SEBI both sit behind Akamai/Cloudflare WAF — their scrapers are implemented correctly but return empty arrays gracefully. In production, a headless browser behind a residential proxy would unblock them.
**With more time:** Puppeteer for MCA/SEBI, plus webhook subscriptions where regulators offer them.

### 2. Relevance scoring: prompt-based with Glomopay context injection

**Considered:** Fine-tuned classifier, keyword rules, embeddings cosine similarity.
**Chose:** Structured LLM prompt with explicit Glomopay context (IFSC, LRS, outward remittances, FEMA, FATF screening).
**Why:** The context is rich and highly specific — LLMs handle this better than keyword rules, and fine-tuning isn't justified at prototype stage. The system prompt explicitly names the dimensions: LRS, outward remittances, KYC, FATF, IFSC.
**With more time:** Calibrate on a gold-set of historical circulars. Measure precision/recall of HIGH vs actual compliance actions taken.

### 3. AI fallback: Gemini 2.5 Flash → Groq LLaMA 3.3

**Considered:** Single provider, Claude API.
**Chose:** Gemini primary (best JSON instruction-following at this task), Groq fallback (free, fast).
**Why:** Provider outages are real. Fallback costs nothing at prototype scale.
**With more time:** Add a confidence signal to detect cases where the fallback provider gave a low-quality response.

### 4. PDF pipeline: pdf-parse → OCR

**Considered:** Sending PDF URLs directly to Gemini's vision API.
**Chose:** Download → pdf-parse → tesseract.js OCR fallback.
**Why:** Most Indian regulatory PDFs are generated (not scanned), so pdf-parse handles them well without API cost. OCR fallback covers scanned edge cases. Vision API would double per-document cost.
**With more time:** pdfjs-dist + node-canvas for per-page OCR on scanned multi-page PDFs.

### 5. Document Q&A: keyword chunk selection, no RAG

**Considered:** Embeddings + vector DB (Pinecone, pgvector).
**Chose:** TF-IDF-style keyword scoring over structured chunks.
**Why:** Documents are short enough (5–15 pages) that full-corpus retrieval is overkill. Keyword scoring on pre-structured chunks gives accurate, explainable citations without infra cost.
**With more time:** Hybrid search (BM25 + embeddings) for multi-document Q&A once the corpus grows.

### 6. Storage: SQLite

**Considered:** PostgreSQL (Supabase), Redis for queuing.
**Chose:** SQLite via better-sqlite3.
**Why:** Zero infra for a prototype. The dataset is small (hundreds of circulars). Synchronous API is actually simpler in a Next.js server context.
**With more time:** Migrate to Postgres when multi-user or when corpus exceeds ~50k rows.

### 7. UI framework: Next.js App Router, pure inline styles

**Considered:** Separate React SPA + FastAPI backend.
**Chose:** Next.js monorepo (API routes + React frontend).
**Why:** Single deploy target, zero CORS complexity, shared TypeScript types end-to-end.

---

## What's Next

### 3 Biggest Risks to Resolve Before Production

**1. Relevance accuracy.**
The prompt-based scorer may produce false positives (irrelevant circulars marked HIGH) or false negatives (relevant ones marked LOW). Need a gold-set evaluation: have the actual compliance team label 50 historical circulars, then measure precision/recall at HIGH threshold. Target: >90% recall on HIGH-relevance items (missing a critical circular is worse than a false positive).

**2. Source stability.**
MCA and SEBI are both behind WAFs that block server-side requests today. If RBI changes their RSS structure, the primary feed breaks. Production requires: headless browser fallback for WAF-blocked sources, RSS feed health checks with alerting, and a dead-man's-switch alert if no new circulars arrive within N days.

**3. LLM cost and latency at scale.**
At 50 circulars/week across 5 sources, Gemini API cost is negligible. But if ingestion expands (SEBI volumes alone can spike) or the team runs bulk historical processing, costs grow. Need per-circular cost tracking and a circuit breaker that pauses processing and alerts if monthly cost exceeds threshold.

### Metrics to Measure Success

| Metric | Target | How to measure |
|---|---|---|
| Time-to-awareness | < 4 hours from circular publication to AI analysis appearing in feed | Timestamp circular publish date vs `created_at` + `processed_at` in DB |
| Compliance team coverage | 100% of HIGH-relevance circulars reviewed within 24h | Track `reviewed` flag rate on HIGH items |
| Relevance precision | < 20% false positive rate on HIGH/MEDIUM | Manual audit of 50 circulars/month by compliance lead |
| Action item specificity | Compliance lead rates ≥70% of action items as "actionable without further research" | Monthly 5-minute survey |

### 3-Month Roadmap

**Month 1 — Harden the signal**
- Build a gold-set evaluation pipeline; tune Glomopay system prompt against it
- Add SEBI and MCA via headless browser (Playwright on a small EC2/Railway instance)
- Email digest: daily summary of new HIGH/MEDIUM items, zero-config for compliance team
- Scheduled auto-ingestion (cron every 6 hours)

**Month 2 — Expand coverage and workflow**
- Manual PDF upload for off-channel documents (audit reports, KPMG frameworks)
- Cross-circular Q&A: "What are our current AML/CFT obligations?" with citations across the full corpus (requires pgvector or Pinecone)
- Obligation tracker: a live table of "active obligations" derived from HIGH-relevance circulars, with owner assignment and due dates

**Month 3 — Production-grade reliability**
- Multi-user auth (Supabase Auth or Clerk) — so each team member has reviewed/action state
- Audit trail: every AI analysis tagged with model version, prompt hash, and timestamp (for regulatory defensibility)
- Notification integrations: Slack webhook for HIGH-relevance circulars within 1 hour of detection
- SLA dashboard: time-to-detection, coverage rate, action item completion rate

---

## Deployment

### Vercel (recommended — zero config)

```bash
npm install -g vercel
vercel
# Follow prompts, add GEMINI_API_KEY and GROQ_API_KEY as env vars
```

**Note:** Vercel's ephemeral filesystem means SQLite data doesn't persist across deployments. For production, replace `lib/db.ts` with a Postgres adapter (the interface is identical — just swap the driver). The rest of the codebase requires no changes.

### Self-hosted (Node.js server)

```bash
# On your server
git clone <repo>
cd regulatory-intel
npm install
cp .env.local.example .env.local
# Edit .env.local with your keys

npm run build
npm start
# App runs on port 3000
# Use nginx/Caddy to reverse-proxy
```

Data persists in `./data/circulars.db` — back this up or mount as a volume.

### Docker (optional)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t regulatory-intel .
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your_key \
  -e GROQ_API_KEY=your_key \
  -v $(pwd)/data:/app/data \
  regulatory-intel
```

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | Single deploy, shared TS types, API routes co-located |
| Database | SQLite (better-sqlite3) | Zero infra, synchronous, sufficient for prototype scale |
| AI primary | Gemini 2.5 Flash | Best JSON instruction-following, large context window |
| AI fallback | Groq LLaMA 3.3 70B | Free tier, fast, provider redundancy |
| PDF parsing | pdf-parse + tesseract.js | No API cost, handles 95% of regulatory PDFs |
| Scraping | axios + cheerio | Lightweight, sufficient for structured sources |
| UI | React 19, inline styles | No CSS framework dependency, HIG-inspired design |
