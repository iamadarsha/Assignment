<div align="center">

# 🛡️ Regulatory Intel

### *AI compliance radar for cross-border remittance.*

**Tracks every circular from RBI · IFSCA · MCA · SEBI · FATF — auto-classifies relevance, extracts action items, and lets compliance staff interrogate any document in plain English.**

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-assignment--ten--iota--73.vercel.app-000?style=for-the-badge)](https://assignment-ten-iota-73.vercel.app)
[![Stack](https://img.shields.io/badge/Next.js_15-React_19-000?style=for-the-badge&logo=next.js)](#-tech-stack)
[![AI](https://img.shields.io/badge/Gemini_2.5_Flash-→_Groq_LLaMA_3.3-f59e0b?style=for-the-badge)](#-features)
[![License](https://img.shields.io/badge/License-MIT-3b82f6?style=for-the-badge)](#-license)

[**Live Demo**](https://assignment-ten-iota-73.vercel.app) · [**Features**](#-features) · [**Quick Start**](#-quick-start) · [**API**](#-api-reference) · [**Architecture**](./ARCHITECTURE.md)

</div>

---

## 🎯 What is this?

A **production-grade regulatory monitoring system** built for [Glomopay](https://glomopay.com), a GIFT City IFSC-licensed outward-remittance operator.

Every day, RBI, IFSCA, MCA, SEBI, and FATF publish circulars. Most are noise. A handful change how a remittance company has to operate — *tomorrow*. Regulatory Intel finds the signal, scores its relevance, and tells your compliance team exactly what to do next.

> Built as a take-home assignment for the **Glomopay Full Stack Builder** role. Now public as a reference architecture for any fintech that needs auditable AI-assisted compliance tooling.

---

## ✨ Features

| | |
|---|---|
| 🌐 **Multi-source fetch** | RBI (RSS) · IFSCA (JSON API) · MCA · SEBI · FATF — parallel, fail-isolated |
| 🎯 **AI relevance scoring** | `HIGH` / `MEDIUM` / `LOW` / `NOT_RELEVANT` with Glomopay-specific context |
| ✅ **Action items** | Concrete compliance steps extracted from each circular |
| 📚 **Evidence packs** | Verbatim document quotes grounding every AI claim |
| 📄 **PDF pipeline** | Auto-download → `pdf-parse` → Tesseract OCR fallback |
| 💬 **Document Q&A** | Ask any question; get an answer with **page-level citations** |
| 🔖 **Review tracking** | Mark as reviewed; persists across sessions (SQLite-backed) |
| 🩺 **Source health** | Per-source status after each fetch — `ok` / `empty` / `blocked` / `error` |
| 🛟 **Degraded mode** | Gemini 2.5 Flash → Groq LLaMA 3.3 failover, surfaced in UI |
| 🧹 **Deduplication** | `INSERT OR IGNORE` on URL — zero duplicates, ever |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- `GEMINI_API_KEY` — [get one free](https://aistudio.google.com/app/apikey)
- `GROQ_API_KEY` — [get one free](https://console.groq.com)

### Install & run

```bash
git clone https://github.com/iamadarsha/Assignment.git
cd Assignment
npm install

# Add API keys
cat <<EOF >> .env.local
GEMINI_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
EOF

npm run dev
# → http://localhost:3000
```

### Your first three minutes

1. **Fetch Updates** → pulls latest circulars from all 5 sources in parallel
2. **Process AI** → runs Gemini analysis (auto-loops until every circular is scored)
3. Filter by **High** → review action items for your most urgent obligations
4. Expand any card → **Ask This Document** to interrogate the full circular with citations

---

## 🧠 How it works

```mermaid
flowchart LR
    A[5 Regulator Sources<br/>RBI · IFSCA · MCA · SEBI · FATF] --> B[Parallel Fetcher<br/>fail-isolated]
    B --> C[(SQLite<br/>circulars.db)]
    C --> D{PDF?}
    D -->|yes| E[pdf-parse → OCR fallback]
    D -->|no| F[HTML extraction]
    E --> G[Structured Chunks<br/>section + page metadata]
    F --> G
    G --> H[Gemini 2.5 Flash<br/>relevance + actions]
    H -->|fails| I[Groq LLaMA 3.3<br/>fallback]
    H --> J[UI: scored cards + Q&A]
    I --> J

    style A fill:#3b82f6,stroke:#fff,color:#fff
    style H fill:#f59e0b,stroke:#fff,color:#fff
    style I fill:#f59e0b,stroke:#fff,color:#fff
    style J fill:#22c55e,stroke:#fff,color:#fff
```

---

## 🔌 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/circulars` | `GET` | All stored circulars with AI fields |
| `/api/fetch` | `POST` | Scrape all 5 sources, insert new circulars |
| `/api/process` | `POST` | AI-analyse the next batch of unprocessed circulars |
| `/api/chat` | `POST` | `{ circularId, question }` → answer + evidence |
| `/api/review` | `POST` | `{ id, reviewed: bool }` → persist review state |

---

## 📁 Project Structure

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
  db.ts                     # SQLite schema, migrations, queries
  fetchAll.ts               # Parallel fetcher orchestrator + source health
  fetch{RBI,IFSCA,MCA,SEBI,FATF}.ts   # Per-source scrapers (WAF-aware)
  processCircular.ts        # AI analysis — Gemini → Groq fallback
  chatDocument.ts           # Document Q&A with chunk scoring + evidence
  structureText.ts          # Text → chunks with section/page metadata
  pdfPipeline.ts            # PDF download + parse + OCR
data/
  circulars.db              # SQLite DB (auto-created)
  pdfs/                     # Downloaded PDFs (auto-created)
```

---

## 🚢 Deployment

### Vercel (one-command)

```bash
npx vercel
# Add GEMINI_API_KEY + GROQ_API_KEY in the dashboard
```

> SQLite data won't persist across Vercel deployments (ephemeral filesystem). See [ARCHITECTURE.md](./ARCHITECTURE.md) for the Postgres migration path.

### Self-hosted Node.js

```bash
npm run build && npm start
# Data persists in ./data/circulars.db — back this up or mount as a volume
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

A `fly.toml` is also included for [Fly.io](https://fly.io) deploys with persistent volumes.

---

## 🧰 Tech Stack

| Layer | Tooling |
|---|---|
| **Frontend** | Next.js 15 · React 19 · TypeScript · Tailwind CSS |
| **Backend** | Next.js Route Handlers · Node 18+ runtime |
| **AI** | Gemini 2.5 Flash *(primary)* · Groq LLaMA 3.3 *(failover)* |
| **Storage** | SQLite *(better-sqlite3)* · file-system PDF cache |
| **Document pipeline** | `pdf-parse` · Tesseract.js *(OCR fallback)* |
| **Hosting** | Vercel-ready · Docker-ready · Fly.io `fly.toml` included |

---

## ⚠️ Known Limitations

- **MCA & SEBI** sit behind Akamai/Cloudflare WAFs that block server-side requests. Fetchers degrade gracefully and surface block status in the UI. Production fix: scheduled Playwright job. See [HANDOVER.md](./HANDOVER.md).
- **Single-writer SQLite** is sufficient for a prototype; migrate to Postgres for multi-user or concurrent writes.
- **Previously-processed circulars** keep their old AI output until re-processed. A `/api/process?force=true` flag is the planned fix.

---

## 📖 Documentation

| File | Contents |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data flow, component map |
| [TECH_STACK.md](./TECH_STACK.md) | Every technology choice with rationale |
| [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md) | Problem scoping, trade-offs, 3-month roadmap |
| [HANDOVER.md](./HANDOVER.md) | Developer handover — known issues, env setup, next steps |

---

## 📄 License

MIT — free to use, fork, and adapt.

---

<div align="center">

**Built by [Adarsha Chatterjee](https://github.com/iamadarsha) · [Portfolio →](https://github.com/iamadarsha/Lego-Portfolio)**

</div>
