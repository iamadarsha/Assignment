# Design Decisions — Regulatory Intel

## Executive Summary (300 words)

**Problem scoping.** Glomopay's compliance team manually monitors five regulator websites — RBI, IFSCA, MCA, SEBI, and FATF — spending 3–5 hours per week reading, downloading, and triaging circulars to decide if any affect their LRS outward-remittance operations. The core pain isn't reading volume; it's triage cost. A compliance officer reads everything because the cost of missing a critical circular is severe. The highest-leverage intervention is an accurate, grounded relevance signal — specific enough to Glomopay's context (IFSC, LRS, GIFT City, FATF screening) that the team trusts it and delegates on it. I explicitly did not build: cross-corpus RAG, scheduled ingestion, or email notifications — these are high-value but depend on validating the signal quality first. The entire MVP is oriented around proving the signal is trustworthy, not maximising feature count.

**Design decisions in one line each.** SQLite over Postgres: zero infra for a prototype, one-file migration path. Gemini → Groq fallback: provider outages are real; redundancy costs one `try/catch`. Keyword chunk scoring over vector embeddings: documents are short enough that BM25-style scoring retrieves the right passage at zero infra cost. Inline styles over Tailwind: eliminated a Turbopack/PostCSS child-process incompatibility in the dev environment. Optimistic UI for review state: compliance workflows are high-frequency; a 200ms round-trip before a visual response would feel broken.

**What's next.** Three risks: relevance accuracy (does the AI actually agree with what a compliance officer would flag?), WAF-gated sources (MCA and SEBI require Playwright + proxy), and LLM cost at scale (fine with 50 circulars/week; needs a circuit breaker at 500+). Three months: harden the signal with a gold-set eval (Month 1), add cross-corpus Q&A and obligation tracking (Month 2), multi-user auth and Slack integration (Month 3).

---

## Problem Scoping

**The user:** A Glomopay compliance officer who currently visits five regulator websites manually each week, downloads PDFs, reads them in full, and decides whether each circular affects LRS processing, KYC/AML controls, or IFSC licensing requirements. There is no structured workflow — it is entirely memory- and habit-driven.

**Highest-leverage pain point:** Not the reading volume. The *triage*. Compliance officers read everything because they cannot afford to miss a critical circular. The intervention with the highest leverage is an accurate, explainable relevance signal — specific enough to Glomopay's exact context (outward remittances, LRS limits, GIFT City IFSC, FATF screening, FEMA obligations) that the compliance team trusts it and delegates on it.

**What I explicitly did not build:**
- **Cross-document corpus RAG** — out of scope for a 4–6h prototype. Single-document analysis gets the signal quality right first; corpus-wide Q&A is a natural month 2 extension.
- **Scheduled auto-ingestion** — replaced with a manual "Fetch Updates" trigger. Adding a cron is one environment variable and a scheduled job once deployed; doing it now before validating the signal quality is premature.
- **Email / Slack notifications** — high-value plumbing once the signal is validated. Building a notification system on top of a signal you haven't calibrated yet creates more noise than value.
- **Manual document upload** — deliberate cut; most Glomopay-relevant circulars come from the five monitored sources. This would be sprint 2.

**Key assumptions I'd validate before production:**
1. That the AI relevance scores agree with what the compliance team would actually flag (needs a gold-set evaluation)
2. That compliance staff will use a web tool rather than wanting a digest email
3. That RBI/IFSCA feed structures remain stable (they have changed without notice before)

---

## Design Decisions

### 1. Source strategy — RSS + JSON API over full scraping

**Alternatives considered:**
- Playwright/Puppeteer for all five sources (100% browser simulation, handles all WAFs)
- Full HTML scraping for all sources via axios + cheerio

**Why I chose RSS/API first:**
RBI publishes a well-structured RSS feed. IFSCA exposes a JSON API (discovered by inspecting their website's XHR requests). FATF has RSS. For these three sources, RSS/API is dramatically more reliable than HTML scraping — no DOM structure changes, no rate limiting, no session handling.

MCA and SEBI are correctly implemented as HTML scrapers, but both sit behind Akamai and Cloudflare WAFs respectively that return HTTP 403 for all non-browser server-side requests. The scrapers degrade gracefully (return empty array + `_warning` flag) and the UI surfaces the block status. This is the right call for a prototype — the scraper logic is correct and tested against the live DOM structure; the WAF bypass is a deployment concern, not a code concern.

**What I'd change with more time:**
Add a Playwright worker service for MCA and SEBI, running on a schedule (every 6h) behind a residential proxy. The HTML parsing logic in `fetchMCA.ts` and `fetchSEBI.ts` is already correct and would work unchanged with a Playwright content feed.

---

### 2. Relevance scoring — prompt-based LLM with Glomopay context injection

**Alternatives considered:**
- Fine-tuned binary classifier (relevant/not relevant)
- Keyword rules (if document contains "LRS" or "outward remittance" → HIGH)
- Embedding cosine similarity against a Glomopay context document

**Why I chose structured LLM prompting:**
The compliance context is rich and nuanced. "Outward remittances" and "LRS" appear in many circulars that are actually not relevant to Glomopay's specific GIFT City / IFSC structure. Keyword rules produce too many false positives. Embeddings require a labelled training set or carefully crafted anchor documents. An LLM with explicit Glomopay context (IFSC license, LRS, outward remittances, FEMA obligations, FATF screening requirements) can reason about relevance in a way that keyword rules cannot, and requires no training data.

The system prompt explicitly names the four relevance dimensions: LRS operations, KYC/AML compliance, IFSC licensing, and FEMA/FATF obligations. This gives the model a structured rubric rather than asking it to guess.

**What I'd change with more time:**
Build a gold-set evaluation pipeline. Export 50–100 historical circulars with labels from the actual compliance team. Run them through the current prompt. Measure precision/recall at the HIGH threshold (recall matters more — missing a critical circular is a regulatory failure). Tune the prompt against this benchmark before relying on the scores operationally.

---

### 3. AI fallback chain — Gemini 2.5 Flash → Groq LLaMA 3.3

**Alternatives considered:**
- Single provider (Gemini only)
- Claude 3.5 Sonnet as primary
- GPT-4o as primary

**Why this combination:**
Gemini 2.5 Flash has consistently strong JSON instruction-following at this task — it reliably returns clean JSON without markdown wrappers, even under edge cases (very short documents, binary PDFs with no extractable text). Groq with LLaMA 3.3 70B is the best free-tier fallback: fast inference, generous rate limits, good structured output.

The fallback costs nothing at prototype scale: one `try/catch` block and a second API call. The UI explicitly surfaces when the fallback was used ("Fallback provider" badge on Q&A responses) — compliance staff know which model produced the answer.

**What I'd change with more time:**
Add a response quality signal to the fallback path. If the fallback returns LOW confidence on a HIGH-relevance document, flag it for human review rather than surfacing it silently. Add a per-provider cost tracker so the team can monitor API spend.

---

### 4. PDF pipeline — pdf-parse → tesseract.js OCR

**Alternatives considered:**
- Send PDF URLs directly to Gemini's file/vision API
- AWS Textract
- pdfjs-dist (PDF.js)

**Why pdf-parse + OCR fallback:**
The vast majority of Indian regulatory PDFs are digitally generated — they contain embedded text, not scanned images. `pdf-parse` extracts this text in milliseconds with zero API cost. Tesseract.js handles the scanned-document edge case entirely in Node.js — no external API, no per-page cost, no network dependency.

Sending PDFs to Gemini's vision API would double the per-document AI cost, require downloading the PDF and re-uploading it to Google's file API, and break when PDFs require session authentication or redirects. AWS Textract is more accurate for complex layouts but adds $0.015/page cost and an external dependency.

**What I'd change with more time:**
Use `pdfjs-dist` for text extraction — it has better layout preservation for multi-column regulatory documents (common in FATF reports). Add AWS Textract as the OCR fallback (much more accurate than Tesseract for low-quality scans). Add a per-page extraction step for very long documents (100+ pages) to avoid processing the full document when only the first 20 pages are relevant.

---

### 5. Document Q&A — keyword chunk scoring, no vector DB

**Alternatives considered:**
- Embeddings + pgvector (Postgres) or Pinecone
- Full-document prompting (send the entire document to the AI for every question)
- No Q&A feature (defer to a later sprint)

**Why keyword chunk scoring:**
Individual regulatory circulars are short — typically 5–15 pages, 3,000–8,000 tokens. A keyword-based chunk selector (TF-IDF style: count question-token overlaps with chunk text, weight section-heading matches double) retrieves the right passage with high accuracy for direct factual questions. It's deterministic, explainable, and requires zero additional infrastructure.

Full-document prompting works but is slow and expensive for long documents. Embeddings + vector DB would add infra complexity (provisioning, indexing, query latency) for minimal quality improvement at single-document scale.

**What I'd change with more time:**
Hybrid retrieval (BM25 + embeddings) becomes valuable once Q&A spans the entire corpus ("What are our current obligations under all IFSCA circulars?"). At that point, pgvector in Postgres is the right call — the embedding index lives in the same database as the circular metadata.

---

### 6. Storage — SQLite (better-sqlite3)

**Alternatives considered:**
- Supabase Postgres (hosted)
- PlanetScale / Neon serverless Postgres
- Redis for state + Postgres for relational data

**Why SQLite:**
A prototype compliance tool for one team will have hundreds, not millions, of rows. SQLite handles this comfortably. The synchronous `better-sqlite3` API removes `async/await` from every database call — transactions are straightforward, race conditions are eliminated, and the code is significantly simpler than async Postgres drivers in a Next.js server context.

The migration path is explicit: replace the `lib/db.ts` implementation with a `pg` or `@neondatabase/serverless` driver. The query interface (typed functions with the same signatures) stays identical. The rest of the codebase requires no changes.

**What I'd change with more time:**
Migrate to Postgres as soon as the tool goes into production. Vercel's ephemeral filesystem means SQLite data doesn't persist across deployments. Neon serverless Postgres is the natural replacement — same region co-location, serverless billing, and the `lib/db.ts` interface swaps cleanly.

---

### 7. UI — React, pure inline styles, no CSS framework

**Alternatives considered:**
- Tailwind CSS v4
- shadcn/ui components
- CSS Modules

**Why inline styles:**
The primary driver was a Turbopack/PostCSS incompatibility in the development environment: Tailwind's PostCSS transform requires a child `node` process that couldn't be spawned in the sandbox. Removing `@import "tailwindcss"` from globals.css and using inline styles everywhere resolved the issue immediately.

The design uses a consistent set of JS constants (colour tokens, spacing, border radii) that function equivalently to CSS custom properties. The Apple HIG-inspired visual language (SF Pro typography metrics, #1D1D1F/F5F5F7 colour palette, 14px borderRadius cards) is fully achievable with inline styles.

**What I'd change with more time:**
Tailwind v4 (native CSS cascade layers, no PostCSS required) is the right long-term choice — responsive breakpoints, dark mode, and consistent class names across the team. shadcn/ui for complex interactive components (date pickers, comboboxes, toast notifications).

---

## What's Next

### The 3 Biggest Risks to Resolve First

**Risk 1 — Relevance accuracy.** The AI relevance scorer may produce false positives (irrelevant circulars marked HIGH) or false negatives (critical circulars marked LOW or NOT RELEVANT). This is the existential risk: if the compliance team catches the AI marking a critical circular as LOW, they stop trusting the tool and revert to manual monitoring. **Resolution:** Build a gold-set evaluation pipeline. Have the compliance team label 50 historical circulars. Measure precision/recall at HIGH threshold. Target: >95% recall (false negatives are more dangerous than false positives for a compliance tool). Tune the system prompt against this benchmark.

**Risk 2 — Source stability.** MCA and SEBI are currently WAF-blocked. If RBI changes their RSS feed structure, the primary data source breaks silently. If IFSCA changes their JSON API, IFSCA circulars stop arriving. **Resolution:** Add a dead-man's-switch alert: if no new circulars arrive from a source within N days (configurable per source), send an alert to the engineering team. Add Playwright for MCA/SEBI. Add a feed health check endpoint.

**Risk 3 — LLM cost and latency at ingestion scale.** At 50 circulars/week, Gemini API cost is negligible (~$0.50–2.00/month). But SEBI alone can publish 20+ circulars in a single day during regulatory reporting periods. Unbounded AI processing would run up costs and could hit rate limits. **Resolution:** Add a circuit breaker: pause processing and alert if monthly API spend exceeds a configurable threshold. Add per-circular cost tracking to the database. Move AI processing to a queue (BullMQ) rather than a synchronous API route.

---

### How to Measure Whether This Tool Is Actually Working

**2–3 Concrete Metrics:**

| Metric | Definition | Target | How to measure |
|---|---|---|---|
| **Time-to-awareness** | Time from circular publication date to the circular appearing in the feed with AI analysis | < 6 hours | `processed_at - date` stored in DB; alert if P95 > 6h |
| **Compliance team coverage rate** | % of HIGH-relevance circulars that have `reviewed = 1` within 24 hours of appearing | > 90% | SQL: `SELECT COUNT(*) WHERE relevance = 'HIGH' AND reviewed = 1 AND created_at < now() - 24h` |
| **Action item specificity score** | Compliance lead rates what % of extracted action items are "actionable without further research" | > 70% | Monthly 5-minute survey (3 questions, scored 1–5) |

---

### 3-Month Roadmap

**Month 1 — Harden the signal**
- Gold-set evaluation: label 50 historical circulars with the compliance team, measure and tune precision/recall
- Playwright + proxy for MCA and SEBI — unblocks 2 of 5 sources
- Scheduled auto-ingestion: cron every 6 hours (Vercel Cron or Railway)
- Email digest: daily Resend email with new HIGH/MEDIUM circulars, one-sentence summaries, direct links
- Dead-man's-switch alerts: notify engineering if any source goes silent for >48 hours

**Month 2 — Expand the workflow**
- Postgres migration (required for Vercel production persistence)
- Multi-user auth: Supabase Auth or Clerk — per-user review state, role-based access (analyst vs. compliance lead)
- Manual PDF upload: compliance staff can upload off-channel documents (audit reports, KPMG frameworks, internal policy drafts)
- Obligation tracker: a live table of "active compliance obligations" extracted from HIGH-relevance circulars, with owner assignment and due dates
- Cross-circular Q&A: "What are our current AML/CFT obligations?" with citations across the full corpus (pgvector or Pinecone)

**Month 3 — Production-grade reliability**
- Slack integration: push HIGH-relevance circulars to #compliance-alerts within 1 hour of detection
- Audit trail: every AI analysis tagged with model version, prompt hash, and timestamp — defensible in a regulatory audit
- SLA dashboard: time-to-detection per source, action item completion rate, monthly review coverage
- Force re-process API: `/api/process?force=true` to apply prompt improvements to historical circulars
- Mobile-responsive UI: responsive layout for on-the-go review
