import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { getCircularById } from "./db";
import { structureText, TextChunk } from "./structureText";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatEvidence {
  text: string;
  section: string;
  page: number;
}

export interface ChatResponse {
  answer: string;
  evidence: ChatEvidence[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  status: "OK" | "DEGRADED" | "INSUFFICIENT_EVIDENCE";
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

const CHAT_SYSTEM = `You are a document analyst. Answer questions ONLY from the provided document.

Rules:
- Answer ONLY from the document sections provided below.
- If the answer is not in the document, respond: "Not found in the uploaded document."
- Do NOT use general knowledge.
- Cite the exact quote, section name, and approximate page number.
- Indicate your confidence level honestly.

Output STRICT JSON ONLY:
{
  "answer": "...",
  "evidence": [
    { "text": "exact quote", "section": "Section heading", "page": 1 }
  ],
  "confidence": "HIGH | MEDIUM | LOW",
  "status": "OK | INSUFFICIENT_EVIDENCE"
}

Do NOT include markdown. Do NOT include text outside the JSON.`;

// ─── Lightweight keyword chunk selector ─────────────────────────────────────

const STOP = new Set([
  "the","a","an","is","are","was","were","be","been","have","has","had","do",
  "does","did","will","would","shall","should","may","might","must","can",
  "could","of","in","to","for","with","on","at","from","by","about","as",
  "into","through","during","before","after","and","but","or","not","so",
  "yet","both","either","each","every","all","any","some","no","only","own",
  "same","than","too","very","what","which","who","this","that","these",
  "those","it","its","how","when","where","why",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function scoreChunk(chunk: TextChunk, qTokens: string[]): number {
  const words = new Set(tokenize(chunk.text));
  const section = new Set(tokenize(chunk.section));
  let score = 0;

  for (const qt of qTokens) {
    if (words.has(qt)) score += 1;
    if (section.has(qt)) score += 2;
    // Partial match bonus
    for (const w of words) {
      if (w.includes(qt) || qt.includes(w)) { score += 0.3; break; }
    }
  }
  return score;
}

function selectChunks(chunks: TextChunk[], question: string, topK = 5): TextChunk[] {
  const qTokens = tokenize(question);
  if (qTokens.length === 0) return chunks.slice(0, topK);

  return chunks
    .map((c) => ({ c, s: scoreChunk(c, qTokens) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topK)
    .filter((x) => x.s > 0)
    .map((x) => x.c);
}

// ─── AI calls with fallback ─────────────────────────────────────────────────

async function callGemini(system: string, user: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: system,
  });
  const result = await model.generateContent(user);
  return result.response.text();
}

async function callGroq(system: string, user: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: 1024,
  });
  return completion.choices[0]?.message?.content ?? "";
}

function parseJSON(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();
  return JSON.parse(cleaned);
}

// ─── Public entry ───────────────────────────────────────────────────────────

const EMPTY: ChatResponse = {
  answer: "",
  evidence: [],
  confidence: "LOW",
  status: "INSUFFICIENT_EVIDENCE",
};

export async function chatWithDocument(
  circularId: string,
  question: string
): Promise<ChatResponse> {
  // ── Load document ─────────────────────────────────────────────────────────
  const circular = getCircularById(circularId);
  if (!circular) return { ...EMPTY, answer: "Document not found." };

  // ── Build chunks from stored data ─────────────────────────────────────────
  let chunks: TextChunk[] = [];
  if (circular.structured_chunks) {
    try { chunks = JSON.parse(circular.structured_chunks); } catch { /* empty */ }
  }
  if (chunks.length === 0) {
    const text = circular.extracted_text || circular.content || "";
    if (!text.trim()) {
      return { ...EMPTY, answer: "No document content available for this circular." };
    }
    chunks = structureText(text);
  }

  // ── Select relevant chunks ────────────────────────────────────────────────
  const relevant = selectChunks(chunks, question);
  if (relevant.length === 0) {
    return {
      ...EMPTY,
      answer: "Not found in the uploaded document. No sections match your question.",
    };
  }

  // ── Build prompt ──────────────────────────────────────────────────────────
  let context = "";
  for (const c of relevant) {
    const entry = `[Section: ${c.section} | Page ~${c.page}]\n${c.text}\n\n`;
    if (context.length + entry.length > 4500) break;
    context += entry;
  }

  const userMessage = `DOCUMENT: ${circular.title} (${circular.source})

RELEVANT SECTIONS:
${context}
QUESTION: ${question}`;

  // ── Call AI with fallback ─────────────────────────────────────────────────
  let raw = "";
  let degraded = false;

  try {
    raw = await callGemini(CHAT_SYSTEM, userMessage);
  } catch (err: any) {
    console.warn(`[chatDocument] Gemini failed: ${err.message}`);
    try {
      raw = await callGroq(CHAT_SYSTEM, userMessage);
      degraded = true;
    } catch (err2: any) {
      console.warn(`[chatDocument] Groq failed: ${err2.message}`);
      return {
        ...EMPTY,
        answer: "Unable to process your question — both AI providers are unavailable.",
        status: "DEGRADED",
      };
    }
  }

  // ── Parse response ────────────────────────────────────────────────────────
  try {
    const parsed = parseJSON(raw);

    const evidence: ChatEvidence[] = Array.isArray(parsed.evidence)
      ? (parsed.evidence as Record<string, unknown>[]).map((e) => ({
          text: String(e.text ?? ""),
          section: String(e.section ?? ""),
          page: Number(e.page) || 0,
        }))
      : [];

    const rawAnswer = String(parsed.answer ?? "");

    const status =
      parsed.status === "INSUFFICIENT_EVIDENCE" ||
      rawAnswer.toLowerCase().startsWith("not found")
        ? "INSUFFICIENT_EVIDENCE" as const
        : degraded
          ? "DEGRADED" as const
          : "OK" as const;

    // Force LOW confidence when the AI couldn't find the answer
    const aiConfidence = (["HIGH", "MEDIUM", "LOW"] as const).includes(
      parsed.confidence as "HIGH"
    )
      ? (parsed.confidence as "HIGH" | "MEDIUM" | "LOW")
      : "MEDIUM";
    const confidence = status === "INSUFFICIENT_EVIDENCE" ? "LOW" : aiConfidence;

    // Humanise "not found" response
    const answer =
      status === "INSUFFICIENT_EVIDENCE" && evidence.length === 0
        ? "The document sections available don't contain a direct answer to this question. Try asking about specific terms from the summary or action items above."
        : rawAnswer;

    return { answer, evidence, confidence, status };
  } catch {
    return {
      answer: raw.slice(0, 500),
      evidence: [],
      confidence: "LOW",
      status: "DEGRADED",
    };
  }
}
