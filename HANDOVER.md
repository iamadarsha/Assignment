# Developer Handover — Regulatory Intel

This document is for the next developer picking up this codebase. It covers environment setup, known issues, non-obvious decisions, and the exact next steps to take.

---

## Environment Setup

### Required environment variables

```env
# .env.local
GEMINI_API_KEY=        # Google AI Studio — https://aistudio.google.com/app/apikey
GROQ_API_KEY=          # Groq console — https://console.groq.com
```

Both have free tiers sufficient for development and moderate production use.

### Node version

Node 18+ required. The project uses native `fetch` (Node 18+) and `Buffer` (built-in).

### First-time setup

```bash
npm install           # installs all deps including native bindings (better-sqlite3, sharp)
npm run dev           # starts dev server on :3000
```

The SQLite database is auto-created at `./data/circulars.db` on first API call. The `./data/pdfs/` directory is created automatically when the first PDF is downloaded.

---

## Codebase Map (quick orientation)

The entire server-side data layer lives in `lib/`. The entire client-side UI lives in `app/page.tsx`. There are five API routes in `app/api/`.

**If something is broken in the feed display** → `app/page.tsx`
**If something is broken in data fetching from regulators** → `lib/fetch*.ts` + `lib/fetchAll.ts`
**If something is broken in AI analysis** → `lib/processCircular.ts`
**If something is broken in Q&A** → `lib/chatDocument.ts`
**If something is broken in the database** → `lib/db.ts`

---

## Known Issues

### 1. MCA and SEBI return empty (WAF-blocked)

**Symptom:** Source health bar shows ⚠ WAF for MCA and/or SEBI after Fetch Updates.

**Root cause:** Both `www.mca.gov.in` (Akamai) and `www.sebi.gov.in` (Cloudflare) return HTTP 403 for all non-browser requests. The scraper code in `fetchMCA.ts` and `fetchSEBI.ts` implements the correct DOM selection logic — it just can't get past the WAF.

**Production fix:** Run a scheduled Playwright job (a headless Chromium instance) in a separate worker process or Railway service. The HTML structure is already handled by the scrapers — just replace the `axios.get()` call with a Playwright `page.goto()` and `page.content()`. Use a residential proxy service (Brightdata, Oxylabs) to avoid IP-level blocks.

**Interim workaround:** Manually add circulars from MCA/SEBI by inserting directly into the SQLite DB or by adding a manual URL input to the UI.

---

### 2. AI prompt improvements require re-processing

**Symptom:** Older circulars show `why_it_matters` that starts with "Glomopay is an IFSC-licensed entity in GIFT City…" — this was the boilerplate from the old prompt.

**Root cause:** The improved `SYSTEM_PROMPT` in `lib/processCircular.ts` only applies to newly-processed circulars. The 20 already-analysed circulars have their AI output stored in SQLite and won't be re-analysed unless forced.

**Fix:** Add a `force` query parameter to `POST /api/process`:
```typescript
// In app/api/process/route.ts
const force = url.searchParams.get('force') === 'true';
const circulars = force
  ? getAllCirculars()               // re-process everything
  : getUnprocessedCirculars(5);    // normal behaviour
```
Then call `POST /api/process?force=true` to rerun all 20 circulars (will consume ~20 Gemini API calls).

---

### 3. Header layout on very narrow screens (<380px)

**Symptom:** On iPhone SE-width viewports, the sticky header may overflow. The logo, timestamp, status message, and two buttons compete for 380px.

**Current mitigation:** `flexWrap: "wrap"` on the header inner div, `minWidth: 0` + `textOverflow: ellipsis` on the status message, `minHeight: 60` (not fixed height).

**Better fix:** Break the header into two rows on mobile — `position: sticky` toolbar with just the logo and buttons on row 1, and status message as a dismissible notification bar on row 2. Or move to Tailwind and use `sm:` breakpoints.

---

### 4. Reviewed state is client-only for unreviewed count

**Symptom:** The "Unreviewed" count in the stats strip decrements in real time as you click "Mark reviewed" — this is correct. But on a hard reload, the count reflects the DB state.

**This is intended behaviour** (optimistic UI). No bug — just documenting so it's not confused for a sync issue.

---

### 5. No auth / no multi-user

The app has no authentication. Anyone who can reach the URL can fetch circulars, trigger AI processing (which consumes API quota), and mark items as reviewed. In production, add Supabase Auth or Clerk in front of all API routes.

---

## Non-obvious Decisions

### Why `better-sqlite3` (synchronous) instead of an async driver?

Next.js API routes run in a Node.js context where synchronous I/O is fine. The synchronous API in `better-sqlite3` removes `async/await` from every DB call, makes transaction code straightforward, and eliminates an entire class of race conditions. SQLite files are also safe for concurrent reads (WAL mode could be enabled for concurrent writes, but write concurrency isn't needed here).

### Why the `_warning` property on returned Circular arrays?

`fetchAll.ts` checks `(items as any)._warning` to distinguish between "source returned 0 results because it's empty" (ok/empty status) and "source was blocked by WAF" (blocked status). This avoids adding an error-signalling channel to the `Promise<Circular[]>` return type — which would require changing all fetcher signatures. It's a pragmatic hack and is documented in `fetchAll.ts`.

### Why chunk scoring instead of embeddings for Q&A?

Individual regulatory circulars are short enough (5–15 pages, ~3,000–8,000 tokens) that keyword-based chunk selection retrieves the right passage with high accuracy for direct factual questions. Embeddings add infra cost (vector DB) and setup complexity for minimal quality gain on single-document Q&A. See [TECH_STACK.md](./TECH_STACK.md) for the full rationale.

### Why `INSERT OR IGNORE`?

The `id` field for most sources is the URL of the circular itself. If the same URL is fetched twice (e.g., the user clicks "Fetch Updates" twice in a row), the second insert is silently ignored — no duplicates, no error. For SEBI, where the URL is not a clean unique identifier, the ID is a base64 hash of the URL (see `makeId` in `fetchSEBI.ts`).

---

## Next Steps (Prioritised)

### Immediate (before production)

1. **Add Playwright for MCA/SEBI** — Unblocks 2 of 5 sources. Run as a scheduled job (Railway cron or GitHub Actions on a schedule). The scraper logic in `fetchMCA.ts`/`fetchSEBI.ts` is already correct — just replace the HTTP call.

2. **Scheduled ingestion** — Add a cron job that calls `POST /api/fetch` + `POST /api/process` every 6 hours. On Vercel, use Vercel Cron. On self-hosted, use `node-cron` or a system cron.

3. **Auth layer** — Add Supabase Auth or Clerk. Protect all API routes with `getSession()` middleware. Scope reviewed state per-user.

4. **Force re-process endpoint** — Add `?force=true` to `/api/process` (see issue #2 above) so prompt improvements can be applied to historical circulars.

### Short-term (Month 1)

5. **Email digest** — Daily Resend/SendGrid email to the compliance team listing new HIGH/MEDIUM circulars with a one-sentence summary and a link. The data is all in SQLite already — just need a cron + email template.

6. **Postgres migration** — Replace `lib/db.ts` with a `pg` or `@neondatabase/serverless` driver. The query interface is identical — it's a 1-hour migration. Required for Vercel production (ephemeral filesystem).

7. **Relevance calibration** — Build a gold-set evaluation: export 50 historical circulars with the compliance team's human labels, run them through the current prompt, measure precision/recall. Tune the system prompt against the benchmark.

### Medium-term (Month 2–3)

8. **Cross-circular Q&A** — "What are our current AML/CFT requirements?" with citations across the full corpus. Requires pgvector or Pinecone for embedding-based retrieval.

9. **Obligation tracker** — A live table of active compliance obligations derived from HIGH-relevance circulars, with owner assignment, due dates, and completion status.

10. **Manual PDF upload** — Allow compliance staff to upload documents that aren't from monitored sources (e.g., KPMG audit reports, internal policy drafts). The PDF pipeline is already built — just needs a file upload UI and endpoint.

---

## Running Tests

No automated test suite is included in this prototype. For a production codebase, the highest-value tests would be:

- **Unit tests** for `structureText.ts` and `chatDocument.ts` chunk selection (deterministic, no API calls)
- **Integration tests** for each fetcher against a recorded HTTP fixture (mock the axios response)
- **AI evaluation harness** — a gold-set of circulars with expected relevance labels, run against the live Gemini API periodically

---

## File Size Limits

`pdf-parse` and `tesseract.js` will handle most regulatory PDFs. Very large PDFs (>50MB, >200 pages) may cause memory issues in a serverless function. Add a size check before processing:

```typescript
// In pdfPipeline.ts, after download
if (buffer.length > 50 * 1024 * 1024) {
  throw new Error(`PDF too large: ${(buffer.length / 1024 / 1024).toFixed(0)}MB`);
}
```

---

## Contact

Built by Iamadarsha. Questions about this codebase → raise an issue or ping the author.
