<div align="center">

<br/>

```
██████╗ ███████╗ ██████╗ ██╗   ██╗██╗      █████╗ ████████╗ ██████╗ ██████╗ ██╗   ██╗
██╔══██╗██╔════╝██╔════╝ ██║   ██║██║     ██╔══██╗╚══██╔══╝██╔═══██╗██╔══██╗╚██╗ ██╔╝
██████╔╝█████╗  ██║  ███╗██║   ██║██║     ███████║   ██║   ██║   ██║██████╔╝ ╚████╔╝
██╔══██╗██╔══╝  ██║   ██║██║   ██║██║     ██╔══██║   ██║   ██║   ██║██╔══██╗  ╚██╔╝
██║  ██║███████╗╚██████╔╝╚██████╔╝███████╗██║  ██║   ██║   ╚██████╔╝██║  ██║   ██║
╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝
                                                                    INTEL
```

# 🛡️ Regulatory Intel

### *The AI compliance radar that never sleeps.*

**Every circular from RBI · IFSCA · MCA · SEBI · FATF — auto-classified, action-extracted, and interrogatable in plain English.**

<br/>

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Try_It_Now-22c55e?style=for-the-badge)](https://assignment-ten-iota-73.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js_15-React_19-000000?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![AI](https://img.shields.io/badge/Gemini_2.5_Flash_→_Groq_LLaMA-Dual_AI-f59e0b?style=for-the-badge)](#-ai-pipeline)
[![License](https://img.shields.io/badge/License-MIT-3b82f6?style=for-the-badge)](#-license)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=for-the-badge&logo=typescript&logoColor=fff)](https://www.typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-044a64?style=for-the-badge&logo=sqlite)](https://sqlite.org)

<br/>

[**🚀 Live Demo**](https://assignment-ten-iota-73.vercel.app) · [**✨ Features**](#-features) · [**🧠 How It Works**](#-how-it-works) · [**⚡ Quick Start**](#-quick-start) · [**🔌 API**](#-api-reference) · [**📁 Structure**](#-project-structure)

<br/>

> *"Built for Glomopay — GIFT City's outward-remittance operator — as a production take-home assignment. Now open-sourced as a reference architecture for any fintech that needs auditable AI compliance tooling."*

</div>

---

## 🎯 The Problem

Every business day, five Indian and global regulators publish circulars:

```
🏦 RBI        → Reserve Bank of India  
🏛️ IFSCA      → International Financial Services Centres Authority  
🏢 MCA        → Ministry of Corporate Affairs  
📈 SEBI       → Securities and Exchange Board of India  
🌐 FATF       → Financial Action Task Force  
```

Most circulars are noise. A handful change how a remittance company has to operate — **tomorrow morning**. Without a system like this, your compliance team spends hours manually sifting PDFs to find the two that actually matter.

**Regulatory Intel fixes that.**

---

## ⚡ Recruiter Quick Scan

| Signal | Details |
|---|---|
| 🏗️ **What it is** | Production-grade AI regulatory monitoring desk for cross-border remittance operators |
| 🧠 **What it demonstrates** | Full-stack delivery · resilient scraping · document pipelines · AI fallback design · operator-grade workflow thinking |
| 🔑 **Differentiator** | Evidence-cited AI analysis — every claim is grounded in a verbatim document quote with page-level citations |
| 🛠️ **Stack** | Next.js 15 · React 19 · TypeScript · SQLite · Gemini 2.5 Flash · Groq LLaMA 3.3 · PDF parsing · Tesseract OCR |
| 🚀 **Status** | Live on Vercel · fully functional · production patterns throughout |

---

## ✨ Features

### 🌐 Multi-Source Regulatory Ingestion
```
RBI (RSS feed)  ──────────────────────────────────┐
IFSCA (JSON API) ─────────────────────────────────┤
MCA (HTML scraper) ───────────────────────────────┼──▶  Parallel Fetcher  ──▶  SQLite DB
SEBI (HTML scraper) ──────────────────────────────┤     fail-isolated
FATF (HTML scraper) ──────────────────────────────┘
```
Each source runs independently — one blocked regulator never stops the others.

### 🤖 AI Review Desk

| Capability | What it does |
|---|---|
| 🎯 **Relevance scoring** | `HIGH` / `MEDIUM` / `LOW` / `NOT_RELEVANT` with Glomopay-specific context |
| ✅ **Action extraction** | Concrete compliance steps extracted from each circular |
| 📚 **Evidence packs** | Verbatim quotes from the source document grounding every AI claim |
| 💬 **Document Q&A** | Ask any question; get answers with page-level citations |
| 🛟 **AI fallback** | Gemini 2.5 Flash → Groq LLaMA 3.3 automatic failover, surfaced in UI |

### 📄 Document Pipeline

```
Circular URL
     │
     ▼
  PDF? ──yes──▶  pdf-parse  ──fails──▶  Tesseract OCR
     │                                        │
    no                                        │
     │                                        │
     ▼                                        ▼
 HTML extraction                    Structured Chunks
                                  (section + page metadata)
                                         │
                                         ▼
                                  Gemini 2.5 Flash
                                   relevance + actions
                                         │
                                   fails? Groq fallback
                                         │
                                         ▼
                                  UI: scored cards + Q&A
```

### 🔖 Compliance Workflow
- Review queue filtered by `HIGH` / `MEDIUM` / `LOW`
- Persisted reviewed state across sessions (SQLite-backed)
- Source health badges — `ok` / `empty` / `blocked` / `error` per regulator
- Deduplication via `INSERT OR IGNORE` on URL — zero duplicate circulars, ever

---

## 🧠 How It Works

```mermaid
flowchart LR
    A["5 Regulator Sources\nRBI · IFSCA · MCA · SEBI · FATF"] --> B["Parallel Fetcher\nfail-isolated"]
    B --> C[("SQLite\ncirculars.db")]
    C --> D{PDF?}
    D -->|yes| E["pdf-parse → OCR fallback"]
    D -->|no| F["HTML extraction"]
    E --> G["Structured Chunks\nsection + page metadata"]
    F --> G
    G --> H["Gemini 2.5 Flash\nrelevance + actions"]
    H -->|fails| I["Groq LLaMA 3.3\nfallback"]
    H --> J["UI: scored cards + Q&A"]
    I --> J

    style A fill:#3b82f6,stroke:#fff,color:#fff
    style H fill:#f59e0b,stroke:#fff,color:#fff
    style I fill:#f59e0b,stroke:#fff,color:#fff
    style J fill:#22c55e,stroke:#fff,color:#fff
```

**Three steps to compliance clarity:**
1. **Fetch Updates** → pulls latest circulars from all 5 sources in parallel
2. **Process AI** → runs Gemini analysis (auto-loops until every circular is scored)
3. **Filter → Review → Ask** → work only the `HIGH` signals, interrogate the source document with citations

---

## ⚡ Quick Start

### Prerequisites

- Node.js 18+
- `GEMINI_API_KEY` — [get one free →](https://aistudio.google.com/app/apikey)
- `GROQ_API_KEY` — [get one free →](https://console.groq.com)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/iamadarsha/Finance-News-Analyser.git
cd Finance-News-Analyser

# Install dependencies
npm install

# Add your API keys
cat <<EOF >> .env.local
GEMINI_API_KEY=your_gemini_key_here
GROQ_API_KEY=your_groq_key_here
EOF

# Start the dev server
npm run dev
# → http://localhost:3000
```

### Your First 3 Minutes

```
 Step 1  →  Click "Fetch Updates"     Pulls all 5 sources in parallel
 Step 2  →  Click "Process AI"        Gemini scores every circular
 Step 3  →  Filter to HIGH            Only the ones that matter
 Step 4  →  Expand any card           Read action items + evidence
 Step 5  →  "Ask This Document"       Interrogate the PDF with citations
 Step 6  →  Mark as Reviewed         Clear the queue
```

---

## 🔌 API Reference

| Method | Endpoint | What it does |
|---|---|---|
| `GET` | `/api/circulars` | All stored circulars with AI fields |
| `POST` | `/api/fetch` | Scrape all 5 sources, insert new circulars |
| `POST` | `/api/process` | AI-analyse the next batch of unprocessed circulars |
| `POST` | `/api/chat` | `{ circularId, question }` → answer + evidence |
| `POST` | `/api/review` | `{ id, reviewed: bool }` → persist review state |

---

## 📁 Project Structure

```
📦 Finance-News-Analyser
├── app/
│   ├── page.tsx                        # Main UI — single-page React
│   └── api/
│       ├── circulars/route.ts          # GET all circulars
│       ├── fetch/route.ts              # POST trigger scrape
│       ├── process/route.ts            # POST trigger AI analysis
│       ├── chat/route.ts               # POST document Q&A
│       └── review/route.ts             # POST toggle reviewed flag
├── lib/
│   ├── db.ts                           # SQLite schema, migrations, queries
│   ├── fetchAll.ts                     # Parallel fetcher orchestrator
│   ├── fetchRBI.ts                     # RBI RSS scraper
│   ├── fetchIFSCA.ts                   # IFSCA JSON API scraper
│   ├── fetchMCA.ts                     # MCA HTML scraper (WAF-aware)
│   ├── fetchSEBI.ts                    # SEBI HTML scraper (WAF-aware)
│   ├── fetchFATF.ts                    # FATF HTML scraper
│   ├── processCircular.ts              # AI analysis — Gemini → Groq fallback
│   ├── chatDocument.ts                 # Document Q&A with chunk scoring
│   ├── structureText.ts                # Text → chunks with metadata
│   └── pdfPipeline.ts                  # PDF download + parse + OCR
└── data/
    ├── circulars.db                    # SQLite DB (auto-created)
    └── pdfs/                           # Downloaded PDFs (auto-created)
```

---

## 🚢 Deployment

### Vercel (One Command)
```bash
npx vercel
# Add GEMINI_API_KEY + GROQ_API_KEY in the Vercel dashboard
```
> SQLite data is ephemeral on Vercel's filesystem. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the Postgres migration path.

### Self-Hosted Node.js
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

### Fly.io
A `fly.toml` is included for persistent-volume deploys — ideal for keeping circular history across restarts.

---

## 🧰 Tech Stack

| Layer | Tooling | Why |
|---|---|---|
| **Framework** | Next.js 15 + React 19 | App Router for clean route handlers + server components |
| **Language** | TypeScript (strict) | Type safety across scraping, AI, and storage layers |
| **AI Primary** | Gemini 2.5 Flash | Best-in-class document reasoning, free tier available |
| **AI Fallback** | Groq LLaMA 3.3 | Sub-100ms inference as a failover, also free tier |
| **Storage** | SQLite (better-sqlite3) | Zero-config, portable, perfect for single-writer compliance use |
| **Document** | pdf-parse + Tesseract.js | Full PDF text + OCR for scanned regulators |
| **Styling** | Tailwind CSS | Rapid operator-grade UI without a design system overhead |
| **Hosting** | Vercel / Docker / Fly.io | Multiple deployment targets for demo + production |

---

## ⚠️ Known Limitations

| Issue | Detail | Production Fix |
|---|---|---|
| MCA & SEBI blocked | Akamai/Cloudflare WAFs block server-side requests | Scheduled Playwright job (see [HANDOVER.md](./HANDOVER.md)) |
| SQLite single-writer | Fine for demos; breaks under concurrent writes | Migrate to Postgres |
| Stale AI output | Previously-processed circulars keep old AI output | `/api/process?force=true` flag planned |

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

<br/>

**Built with precision by [Adarsha Chatterjee](https://www.linkedin.com/in/iamadarsha)**

[![Portfolio](https://img.shields.io/badge/Portfolio-lego--portfolio--ochre.vercel.app-f59e0b?style=for-the-badge)](https://lego-portfolio-ochre.vercel.app)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-iamadarsha-0a66c2?style=for-the-badge&logo=linkedin&logoColor=fff)](https://www.linkedin.com/in/iamadarsha)
[![GitHub](https://img.shields.io/badge/GitHub-iamadarsha-181717?style=for-the-badge&logo=github)](https://github.com/iamadarsha)

*Regulatory Intel — because compliance is a product problem, not a spreadsheet problem.*

</div>
