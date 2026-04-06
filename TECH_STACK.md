# Tech Stack — Regulatory Intel

Every technology choice in this project is intentional. This document explains what was chosen, why, and what would change with more time or at scale.

---

## Framework — Next.js 15 (App Router)

**What it does:** Serves the React UI and all API routes from a single monorepo. No separate backend service.

**Why:**
- Zero CORS complexity — API routes and the frontend share the same origin
- Shared TypeScript types between server and client with no extra build step
- Single deploy target (Vercel, Railway, or a bare Node.js server)
- App Router's server components and Route Handlers give clean server-only code boundaries — API keys stay in the server, always

**Alternatives considered:**
- Separate FastAPI backend + React SPA — adds a service boundary and deploy complexity for no benefit at prototype scale
- Next.js Pages Router — App Router is the default from Next 13+; no reason to use the older pattern

**With more time:** Move long-running work (PDF processing, AI batch jobs) out of API route handlers and into a proper queue (BullMQ). Route handlers have a 30-second Vercel timeout limit.

---

## Database — SQLite via `better-sqlite3`

**What it does:** Stores all circular metadata, AI analysis results, PDF pipeline outputs, and review state in a single file.

**Why:**
- Zero infrastructure for a prototype — no database server to provision
- `better-sqlite3` is synchronous — the API is dramatically simpler than async Postgres drivers in a Next.js context
- A single compliance team's workload (hundreds of circulars) is well within SQLite's performance envelope
- The entire dataset fits in RAM on any modern laptop

**Alternatives considered:**
- Supabase (Postgres) — the right choice for production multi-user; adds infra and auth complexity at prototype stage
- Redis — only needed for queuing or caching, neither of which this prototype requires
- JSON files — no query capability; would require full-file loads for every operation

**With more time:** Migrate to Postgres. The `lib/db.ts` interface is the only file that needs to change — all queries are in one place with a typed interface. The rest of the codebase is database-agnostic.

---

## Primary AI — Google Gemini 2.5 Flash

**What it does:** Analyses each circular and returns structured JSON with relevance, summary, action items, and evidence quotes.

**Why:**
- Gemini 2.5 Flash has exceptional JSON instruction-following — it reliably returns clean JSON without markdown wrappers
- Large context window (1M tokens) handles long regulatory PDFs without chunking for the analysis step
- Competitive pricing for API usage
- `@google/generative-ai` SDK is minimal and typed

**Alternatives considered:**
- Claude 3.5 Sonnet — excellent at structured output; slightly more expensive and no free tier for prototyping
- GPT-4o — strong but the rate limits at free tier make batch processing slow
- Fine-tuned classifier — justified at production scale with a labelled dataset; massive overkill for a prototype

**With more time:** Add a confidence calibration layer — run a gold-set of 50 historically-labelled circulars through the prompt and measure precision/recall. Tune the system prompt against that benchmark.

---

## Fallback AI — Groq (LLaMA 3.3 70B Versatile)

**What it does:** Provides AI responses when Gemini is unavailable or rate-limited.

**Why:**
- Groq's free tier is genuinely generous — thousands of tokens/minute at no cost
- LLaMA 3.3 70B handles structured JSON output reliably
- Provider redundancy is free at prototype scale: one `try/catch` and a fallback call

**Alternatives considered:**
- Single provider — simpler, but a provider outage takes the whole tool down. Not acceptable for a compliance tool.
- Together.ai / Fireworks — comparable free tiers; Groq was chosen for developer experience

**With more time:** Add a per-provider quality score. If the fallback's response has LOW confidence on a HIGH-relevance document, flag it for human review rather than silently surfacing it.

---

## PDF Processing — `pdf-parse` + `tesseract.js`

**What it does:** Downloads PDF circulars, extracts raw text, and (if text is empty) runs OCR to handle scanned documents.

**Why:**
- Most Indian regulatory PDFs are digitally generated — `pdf-parse` extracts clean text at near-zero latency
- `tesseract.js` runs entirely in Node.js — no external API call, no cost, handles the scanned-document edge case
- Together they cover ~99% of the PDFs published by RBI and IFSCA

**Alternatives considered:**
- Sending PDF URLs directly to Gemini Vision — works for single documents but adds per-page API cost and breaks when the PDF requires authentication or is behind a redirect
- AWS Textract / Google Document AI — significantly higher accuracy on complex layouts; justified for production but adds $0.01–0.05/page cost and external dependency
- `pdfjs-dist` (PDF.js) — better layout preservation; more complex Node.js integration (requires canvas shims)

**With more time:** Add `pdfjs-dist` for page-accurate text extraction on multi-column regulatory PDFs (common in FATF reports), and use Textract for scanned documents that Tesseract fails on.

---

## Web Scraping — `axios` + `cheerio`

**What it does:** Fetches HTML pages from MCA and SEBI, parses the DOM structure to extract circular titles, dates, and links.

**Why:**
- `axios` handles redirects, timeouts, and custom headers cleanly
- `cheerio` is a jQuery-like DOM selector — the right tool for structured HTML parsing, much lighter than a headless browser
- For sources that provide RSS or JSON APIs (RBI, IFSCA, FATF), no HTML parsing is needed at all

**Known limitation:**
- MCA (Akamai WAF) and SEBI (Cloudflare WAF) block non-browser HTTP requests with HTTP 403. The scrapers implement the correct logic but return empty arrays with a `_warning` flag when blocked. The UI surfaces this as an amber ⚠ indicator.

**With more time:** Playwright with a residential proxy service (e.g., Brightdata) for MCA and SEBI. Run in a scheduled job (cron every 6h) outside the HTTP request lifecycle to avoid Vercel's function timeout.

---

## UI — React 19, Pure Inline Styles

**What it does:** Single-page React application — a filterable, sortable feed of regulatory circulars with expandable detail cards and a per-document Q&A interface.

**Why inline styles instead of Tailwind/CSS modules:**
- No PostCSS/Turbopack compatibility issues in the development environment
- Design token values (colours, spacing, radius) are defined once as JS constants and referenced throughout — equivalent to a CSS design system
- Apple HIG-inspired visual language is achievable with inline styles and requires no class-name indirection

**Alternatives considered:**
- Tailwind CSS — the right choice for production speed; Turbopack had a PostCSS child-process issue in this environment that was resolved by removing the Tailwind dependency
- shadcn/ui components — excellent for forms and complex interactive components; not needed for a read-heavy compliance feed
- CSS Modules — clean isolation but adds file-per-component overhead

**With more time:** Migrate to Tailwind v4 (native CSS, no PostCSS required) for consistency and to enable responsive design breakpoints declaratively.

---

## Deployment Target — Vercel / Node.js

**Why Vercel:**
- Zero-config Next.js deployment
- Environment variable management built in
- Preview deployments for every git push

**Limitation:** Vercel's ephemeral filesystem means the SQLite database is recreated on each deployment. For a production deployment, the database must be migrated to Postgres (or the `data/` directory persisted via a volume on a self-hosted Node.js server).

---

## Summary Table

| Layer | Choice | Maturity | Would change at scale? |
|---|---|---|---|
| Framework | Next.js 15 | Production | No |
| Database | SQLite (better-sqlite3) | Prototype | Yes → Postgres |
| Primary AI | Gemini 2.5 Flash | Production | No (would add eval layer) |
| Fallback AI | Groq LLaMA 3.3 | Production | No |
| PDF parse | pdf-parse | Production | Partially → pdfjs-dist |
| OCR | tesseract.js | Prototype | Yes → AWS Textract |
| Scraping | axios + cheerio | Production | Partially → Playwright for WAF sources |
| UI styling | Inline styles | Prototype | Yes → Tailwind v4 |
| Deploy | Vercel / Node.js | Production | No |
