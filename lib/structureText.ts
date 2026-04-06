export interface TextChunk {
  text: string;
  section: string;
  page: number;
}

// Patterns that indicate a section/heading line in regulatory documents
const HEADING_PATTERNS: RegExp[] = [
  /^\d+\.\s+\S/, // "1. Introduction"
  /^\d+\s+[A-Z][A-Z\s]{3,}/, // "1 INTRODUCTION"
  /^[A-Z][A-Z\s\-/]{5,}$/, // "INVESTMENT LIMITS FOR FY"
  /^(Chapter|Section|Part|Clause|Schedule|Annexure|Paragraph)\s+[\dIVX]+/i,
  /^[IVXLCDM]{1,4}\.\s+[A-Z]/, // Roman numerals: "IV. Background"
  /^(Background|Purpose|Scope|Applicability|Definitions?|Directions?|Instructions?)\s*$/i,
];

const MAX_CHUNK_CHARS = 1200; // Flush a section block if it grows beyond this
const CHARS_PER_PAGE = 2800; // Rough estimate for page counting

function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 160) return false;
  return HEADING_PATTERNS.some((p) => p.test(t));
}

/**
 * Splits raw extracted text into labeled chunks with section headings and
 * approximate page numbers. Designed for Indian regulatory document formatting.
 */
export function structureText(text: string): TextChunk[] {
  if (!text || text.trim().length === 0) return [];

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const chunks: TextChunk[] = [];
  let currentSection = "Preamble";
  let currentLines: string[] = [];
  let charCount = 0;

  const flush = (page: number) => {
    const body = currentLines.join("\n").trim();
    if (body.length > 20) {
      chunks.push({ text: body, section: currentSection, page });
    }
    currentLines = [];
  };

  for (const line of lines) {
    charCount += line.length + 1;
    const approxPage = Math.max(1, Math.ceil(charCount / CHARS_PER_PAGE));

    if (isHeading(line)) {
      flush(approxPage);
      currentSection = line;
    } else {
      currentLines.push(line);
      // Flush oversized sections so AI sees manageable chunks
      if (currentLines.join("\n").length > MAX_CHUNK_CHARS) {
        flush(approxPage);
      }
    }
  }

  // Final flush
  const finalPage = Math.max(1, Math.ceil(charCount / CHARS_PER_PAGE));
  flush(finalPage);

  return chunks;
}

/**
 * Converts chunks to a formatted string for the AI prompt.
 * Prioritises earlier chunks (most relevant in regulatory docs) and respects maxChars.
 */
export function chunksToContext(chunks: TextChunk[], maxChars = 4000): string {
  let result = "";
  for (const chunk of chunks) {
    const entry = `[Section: ${chunk.section} | Page ~${chunk.page}]\n${chunk.text}\n\n`;
    if (result.length + entry.length > maxChars) break;
    result += entry;
  }
  return result.trim();
}
