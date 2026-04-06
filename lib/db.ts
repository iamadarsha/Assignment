/**
 * db.ts — Pure JSON file store (no native bindings).
 *
 * Replaced better-sqlite3 (native C++ addon) with a plain JSON file so the
 * app runs on Vercel serverless without any native-binding issues.
 *
 * Storage path:
 *   Vercel  → /tmp/circulars.json   (writable; ephemeral per Lambda instance)
 *   Local   → data/circulars.json
 */
import fs from "fs";
import path from "path";

export interface Circular {
  id: string;
  source: string;
  title: string;
  link: string;
  date: string;
  created_at?: string;
  // HTML content (from extractContent)
  content?: string;
  // AI-processed fields
  summary?: string;
  relevance?: string;
  why_it_matters?: string;
  action_items?: string;    // JSON array stored as text
  evidence?: string;        // JSON array stored as text
  // PDF pipeline fields
  is_pdf?: number;          // 1 = PDF, 0 = HTML
  pdf_path?: string;
  extracted_text?: string;
  structured_chunks?: string; // JSON: TextChunk[]
  // Review tracking
  reviewed?: number;        // 1 = reviewed, 0 = unreviewed
}

const DB_PATH = process.env.VERCEL
  ? "/tmp/circulars.json"
  : path.join(process.cwd(), "data", "circulars.json");

function ensureDir(): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

function readAll(): Circular[] {
  try {
    ensureDir();
    if (!fs.existsSync(DB_PATH)) return [];
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as Circular[];
  } catch {
    return [];
  }
}

function writeAll(data: Circular[]): void {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(data), "utf-8");
}

export function initDB(): void {
  if (!fs.existsSync(DB_PATH)) {
    ensureDir();
    writeAll([]);
  }
  console.log("[DB] Initialized");
}

export function insertCirculars(circulars: Circular[]): number {
  const existing = readAll();
  const existingIds = new Set(existing.map((c) => c.id));
  const now = new Date().toISOString();

  const fresh = circulars
    .filter((c) => !existingIds.has(c.id))
    .map((c) => ({ ...c, created_at: now }));

  if (fresh.length > 0) {
    // Prepend so newest first (matches ORDER BY created_at DESC)
    writeAll([...fresh, ...existing]);
  }
  return fresh.length;
}

export function getAllCirculars(): Circular[] {
  return readAll().sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
}

export function getCircularById(id: string): Circular | null {
  return readAll().find((c) => c.id === id) ?? null;
}

export function getUnprocessedCirculars(limit = 10): Circular[] {
  return readAll()
    .filter((c) => !c.summary)
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, limit);
}

/** Store PDF pipeline results (download + parse + structure). */
export function updateCircularPDF(
  id: string,
  fields: {
    is_pdf: boolean;
    pdf_path: string | null;
    extracted_text: string;
    structured_chunks: string;
  }
): void {
  const data = readAll();
  const idx = data.findIndex((c) => c.id === id);
  if (idx !== -1) {
    data[idx] = {
      ...data[idx],
      is_pdf: fields.is_pdf ? 1 : 0,
      pdf_path: fields.pdf_path ?? undefined,
      extracted_text: fields.extracted_text,
      structured_chunks: fields.structured_chunks,
    };
    writeAll(data);
  }
}

/** Set reviewed flag for a circular. */
export function setReviewed(id: string, reviewed: boolean): void {
  const data = readAll();
  const idx = data.findIndex((c) => c.id === id);
  if (idx !== -1) {
    data[idx] = { ...data[idx], reviewed: reviewed ? 1 : 0 };
    writeAll(data);
  }
}

/** Store AI analysis results. */
export function updateCircularAI(
  id: string,
  fields: {
    content?: string;
    summary: string;
    relevance: string;
    why_it_matters: string;
    action_items: string[];
    evidence: string[];
  }
): void {
  const data = readAll();
  const idx = data.findIndex((c) => c.id === id);
  if (idx !== -1) {
    data[idx] = {
      ...data[idx],
      content: fields.content ?? data[idx].content,
      summary: fields.summary,
      relevance: fields.relevance,
      why_it_matters: fields.why_it_matters,
      action_items: JSON.stringify(fields.action_items),
      evidence: JSON.stringify(fields.evidence),
    };
    writeAll(data);
  }
}
