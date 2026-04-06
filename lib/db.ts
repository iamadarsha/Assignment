import Database from "better-sqlite3";
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
  is_pdf?: number;          // 1 = PDF, 0 = HTML (SQLite integer boolean)
  pdf_path?: string;        // local file path under /data/pdfs/
  extracted_text?: string;  // raw text from pdf-parse or OCR
  structured_chunks?: string; // JSON: TextChunk[]
}

let _db: Database.Database | null = null;

function getDB(): Database.Database {
  if (_db) return _db;
  const dbPath = path.join(process.cwd(), "data", "circulars.db");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  return _db;
}

export function initDB(): void {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS circulars (
      id               TEXT PRIMARY KEY,
      source           TEXT NOT NULL,
      title            TEXT NOT NULL,
      link             TEXT NOT NULL,
      date             TEXT DEFAULT '',
      created_at       TEXT DEFAULT (datetime('now')),
      content          TEXT,
      summary          TEXT,
      relevance        TEXT,
      why_it_matters   TEXT,
      action_items     TEXT,
      evidence         TEXT,
      is_pdf           INTEGER DEFAULT 0,
      pdf_path         TEXT,
      extracted_text   TEXT,
      structured_chunks TEXT
    )
  `);

  // Migrate existing tables that may be missing columns
  const existing = (
    db.prepare("PRAGMA table_info(circulars)").all() as { name: string }[]
  ).map((c) => c.name);

  const required: [string, string][] = [
    ["content", "TEXT"],
    ["summary", "TEXT"],
    ["relevance", "TEXT"],
    ["why_it_matters", "TEXT"],
    ["action_items", "TEXT"],
    ["evidence", "TEXT"],
    ["is_pdf", "INTEGER DEFAULT 0"],
    ["pdf_path", "TEXT"],
    ["extracted_text", "TEXT"],
    ["structured_chunks", "TEXT"],
  ];

  for (const [col, def] of required) {
    if (!existing.includes(col)) {
      db.exec(`ALTER TABLE circulars ADD COLUMN ${col} ${def}`);
      console.log(`[DB] Migrated: added column ${col}`);
    }
  }

  console.log("[DB] Initialized");
}

export function insertCirculars(circulars: Circular[]): number {
  const db = getDB();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO circulars (id, source, title, link, date)
    VALUES (@id, @source, @title, @link, @date)
  `);

  let inserted = 0;
  const insertMany = db.transaction((items: Circular[]) => {
    for (const item of items) {
      const result = insert.run(item);
      if (result.changes > 0) inserted++;
    }
  });

  insertMany(circulars);
  return inserted;
}

export function getAllCirculars(): Circular[] {
  const db = getDB();
  return db
    .prepare(`SELECT * FROM circulars ORDER BY created_at DESC`)
    .all() as Circular[];
}

export function getCircularById(id: string): Circular | null {
  const db = getDB();
  const row = db.prepare(`SELECT * FROM circulars WHERE id = ?`).get(id);
  return (row as Circular) ?? null;
}

export function getUnprocessedCirculars(limit = 10): Circular[] {
  const db = getDB();
  return db
    .prepare(
      `SELECT * FROM circulars WHERE summary IS NULL ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Circular[];
}

/** Store PDF pipeline results (download + parse + structure). */
export function updateCircularPDF(
  id: string,
  fields: {
    is_pdf: boolean;
    pdf_path: string | null;
    extracted_text: string;
    structured_chunks: string; // JSON string
  }
): void {
  const db = getDB();
  db.prepare(`
    UPDATE circulars
    SET is_pdf           = @is_pdf,
        pdf_path         = @pdf_path,
        extracted_text   = @extracted_text,
        structured_chunks = @structured_chunks
    WHERE id = @id
  `).run({
    id,
    is_pdf: fields.is_pdf ? 1 : 0,
    pdf_path: fields.pdf_path,
    extracted_text: fields.extracted_text,
    structured_chunks: fields.structured_chunks,
  });
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
  const db = getDB();
  db.prepare(`
    UPDATE circulars
    SET content        = @content,
        summary        = @summary,
        relevance      = @relevance,
        why_it_matters = @why_it_matters,
        action_items   = @action_items,
        evidence       = @evidence
    WHERE id = @id
  `).run({
    id,
    content: fields.content ?? null,
    summary: fields.summary,
    relevance: fields.relevance,
    why_it_matters: fields.why_it_matters,
    action_items: JSON.stringify(fields.action_items),
    evidence: JSON.stringify(fields.evidence),
  });
}
