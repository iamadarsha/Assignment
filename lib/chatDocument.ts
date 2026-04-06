/**
 * chatDocument.ts — Per-circular Q&A with Glomopay compliance context.
 *
 * Context is built in priority order so the chat works even when the full
 * document body was not persisted (e.g. Vercel ephemeral /tmp):
 *
 *  1. structured_chunks  — PDF pipeline (best quality)
 *  2. extracted_text     — PDF raw text
 *  3. content            — HTML body stored after processAll
 *  4. AI analysis        — summary + evidence + action_items (always stored after processing)
 *  5. Live fetch         — fetches URL on-the-fly as last resort
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import axios from "axios";
import * as cheerio from "cheerio";
import { getCircularById, Circular } from "./db";
import { structureText, TextChunk } from "./structureText";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── System prompt ────────────────────────────────────────────────────────────

const CHAT_SYSTEM = `You are a compliance intelligence assistant for Glomopay — an IFSC-licensed payment institution operating from GIFT City, Gujarat, processing outward remittances under RBI's Liberalised Remittance Scheme (LRS).

Glomopay business context:
- Processes outward LRS remittances for individuals (up to USD 250,000/year) and businesses
- IFSC unit licensed in GIFT City — regulated primarily by IFSCA, also bound by RBI master directions, FEMA provisions, FATF recommendations, and SEBI guidelines for investment remittances
- Core compliance obligations: KYC/AML/CFT screening, FATF risk-based approach, 20% TCS collection on LRS above ₹7 lakh, purpose codes, suspicious transaction reporting, beneficial ownership verification
- Key regulators: IFSCA (primary), RBI (LRS limits, master directions), SEBI (investment products), MCA (corporate), FATF (AML/CFT framework)

Your job: Answer questions about this specific regulatory circular, framed for Glomopay's compliance needs.

Rules:
- Base your answer on the document content or AI analysis provided
- Frame answers specifically for Glomopay — what does this mean for our operations?
- If the exact answer is in the document, quote it in the evidence
- If inferable from context, clearly indicate that
- Be concise and actionable — what does the compliance team need to do?

Output STRICT JSON ONLY — no markdown, no text outside JSON:
{
  "answer": "Direct, actionable answer for Glomopay compliance team",
  "evidence": [
    { "text": "relevant quote or analysis point", "section": "Section name or Analysis", "page": 1 }
  ],
  "confidence": "HIGH | MEDIUM | LOW",
  "status": "OK | INSUFFICIENT_EVIDENCE"
}`;

// ─── Keyword chunk selector ───────────────────────────────────────────────────

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

function chunksToContext(chunks: TextChunk[], maxChars = 5000): string {
  let ctx = "";
  for (const c of chunks) {
    const entry = `[Section: ${c.section} | Page ~${c.page}]\n${c.text}\n\n`;
    if (ctx.length + entry.length > maxChars) break;
    ctx += entry;
  }
  return ctx;
}

// ─── Build context from stored AI analysis (fallback) ────────────────────────

function buildAIAnalysisContext(circular: Circular): string {
  const parts: string[] = [
    `CIRCULAR: ${circular.title}`,
    `SOURCE: ${circular.source}`,
    `DATE: ${circular.date}`,
  ];

  if (circular.summary) {
    parts.push(`\nSUMMARY:\n${circular.summary}`);
  }
  if (circular.why_it_matters) {
    parts.push(`\nWHY IT MATTERS TO GLOMOPAY:\n${circular.why_it_matters}`);
  }
  if (circular.action_items) {
    try {
      const items = JSON.parse(circular.action_items) as string[];
      if (items.length > 0) {
        parts.push(`\nACTION ITEMS:\n${items.map((i) => `• ${i}`).join("\n")}`);
      }
    } catch { /* ignore */ }
  }
  if (circular.evidence) {
    try {
      const ev = JSON.parse(circular.evidence) as string[];
      if (ev.length > 0) {
        parts.push(`\nKEY QUOTES FROM DOCUMENT:\n${ev.map((e) => `"${e}"`).join("\n")}`);
      }
    } catch { /* ignore */ }
  }

  return parts.join("\n");
}

// ─── Live fetch from URL (last resort) ────────────────────────────────────────

async function fetchLiveContent(url: string): Promise<string> {
  try {
    const res = await axios.get(url, {
      timeout: 7000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GlomopayBot/1.0)" },
      maxContentLength: 300000,
    });
    const $ = cheerio.load(res.data as string);
    $("script, style, nav, header, footer, aside, iframe").remove();
    return $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000);
  } catch {
    return "";
  }
}

// ─── AI callers ───────────────────────────────────────────────────────────────

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
  return JSON.parse(
    raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim()
  );
}

// ─── Public entry ─────────────────────────────────────────────────────────────

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
  // ── 1. Load circular ──────────────────────────────────────────────────────
  const circular = getCircularById(circularId);
  if (!circular) {
    return {
      ...EMPTY,
      answer: "Circular not found. Please run 'Fetch Updates' then 'Process AI' before chatting.",
    };
  }

  // ── 2. Build context (5-layer priority) ──────────────────────────────────
  let contextText = "";
  let sourceLabel = "document";

  // Layer 1 — structured chunks from PDF pipeline (richest)
  if (!contextText && circular.structured_chunks) {
    try {
      const chunks: TextChunk[] = JSON.parse(circular.structured_chunks);
      if (chunks.length > 0) {
        const relevant = selectChunks(chunks, question);
        if (relevant.length > 0) {
          contextText = chunksToContext(relevant);
        } else {
          // No keyword match — use top chunks anyway
          contextText = chunksToContext(chunks.slice(0, 5));
        }
      }
    } catch { /* ignore */ }
  }

  // Layer 2 — extracted text from PDF (raw text fallback)
  if (!contextText && circular.extracted_text) {
    const chunks = structureText(circular.extracted_text);
    const relevant = selectChunks(chunks, question);
    contextText = relevant.length > 0
      ? chunksToContext(relevant)
      : circular.extracted_text.slice(0, 4500);
  }

  // Layer 3 — HTML content stored after processAll
  if (!contextText && circular.content) {
    const chunks = structureText(circular.content);
    const relevant = selectChunks(chunks, question);
    contextText = relevant.length > 0
      ? chunksToContext(relevant)
      : circular.content.slice(0, 4500);
  }

  // Layer 4 — stored AI analysis (summary + evidence + action_items)
  if (!contextText && circular.summary) {
    contextText = buildAIAnalysisContext(circular);
    sourceLabel = "AI analysis";
  }

  // Layer 5 — live fetch from URL (last resort, adds latency)
  if (!contextText && circular.link) {
    console.log(`[chatDocument] Live fetching for chat: ${circular.link}`);
    const live = await fetchLiveContent(circular.link);
    if (live) {
      contextText = live;
      sourceLabel = "live document fetch";
    }
  }

  if (!contextText) {
    return {
      ...EMPTY,
      answer:
        "No content is available for this circular yet. Run 'Process AI' first, then try again.",
    };
  }

  // ── 3. Build user message ────────────────────────────────────────────────
  const userMessage = `CIRCULAR: ${circular.title}
SOURCE: ${circular.source} | DATE: ${circular.date}
RELEVANCE SCORE: ${circular.relevance ?? "Not yet assessed"}
CONTEXT SOURCE: ${sourceLabel}

---
${contextText}
---

QUESTION FROM GLOMOPAY COMPLIANCE TEAM: ${question}`;

  // ── 4. Call AI with Groq fallback ────────────────────────────────────────
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
        answer: "Both AI providers are temporarily unavailable. Please try again in a moment.",
        status: "DEGRADED",
      };
    }
  }

  // ── 5. Parse and return ──────────────────────────────────────────────────
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
    const isInsufficient =
      parsed.status === "INSUFFICIENT_EVIDENCE" ||
      rawAnswer.toLowerCase().startsWith("not found");

    const status: ChatResponse["status"] = isInsufficient
      ? "INSUFFICIENT_EVIDENCE"
      : degraded
        ? "DEGRADED"
        : "OK";

    const aiConf = (["HIGH", "MEDIUM", "LOW"] as const).includes(
      parsed.confidence as "HIGH"
    )
      ? (parsed.confidence as "HIGH" | "MEDIUM" | "LOW")
      : "MEDIUM";
    const confidence: ChatResponse["confidence"] = isInsufficient ? "LOW" : aiConf;

    return {
      answer: rawAnswer || "No answer could be generated. Try rephrasing your question.",
      evidence,
      confidence,
      status,
    };
  } catch {
    // If JSON parsing fails, return raw text
    return {
      answer: raw.slice(0, 800),
      evidence: [],
      confidence: "LOW",
      status: "DEGRADED",
    };
  }
}
