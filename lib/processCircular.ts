import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { Circular } from "./db";
import { TextChunk, chunksToContext } from "./structureText";

const SYSTEM_PROMPT = `You are a compliance analyst for Glomopay — an IFSC-licensed entity in GIFT City facilitating outward remittances (LRS) regulated by RBI, IFSCA, FEMA, and FATF.

Output STRICT JSON ONLY — no markdown, no text outside JSON:
{
  "summary": "2-3 sentences summarising what this circular says and who it applies to.",
  "relevance": "HIGH | MEDIUM | LOW | NOT RELEVANT",
  "why_it_matters": "One direct sentence on the specific operational or compliance impact on Glomopay's LRS/remittance business. If not relevant, say so plainly.",
  "action_items": ["Concrete step Glomopay must take", "..."],
  "evidence": ["Exact quote from document", "..."]
}

Relevance guide:
- HIGH: Directly changes LRS, remittance limits, KYC, AML, or GIFT City IFSC rules
- MEDIUM: Indirect impact on payments, fintech, cross-border transactions
- LOW: General regulatory update with minor indirect relevance
- NOT RELEVANT: Entirely unrelated to remittances, payments, or GIFT City

Rules:
- "why_it_matters" must be ONE sentence, specific to LRS/remittance operations — no generic context-setting
- "action_items" must be empty [] if relevance is NOT RELEVANT
- "evidence" must be verbatim quotes from the document text provided`;

export interface AIResult {
  summary: string;
  relevance: string;
  why_it_matters: string;
  action_items: string[];
  evidence: string[];
}

/** Build the user message, preferring structured chunks over raw content. */
function buildUserMessage(
  circular: Circular,
  content: string,
  chunks?: TextChunk[]
): string {
  let documentText: string;

  if (chunks && chunks.length > 0) {
    // Section-aware context is richer for the AI
    documentText = chunksToContext(chunks, 4500);
  } else if (content) {
    documentText = content.slice(0, 4500);
  } else {
    documentText = "(No content could be extracted from the source URL)";
  }

  const docType = circular.is_pdf ? "PDF DOCUMENT" : "WEB PAGE";

  return `SOURCE: ${circular.source}
TITLE: ${circular.title}
DATE: ${circular.date}
LINK: ${circular.link}
DOCUMENT TYPE: ${docType}

CONTENT:
${documentText}`;
}

function parseAIResponse(text: string): AIResult {
  const cleaned = text
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  return {
    summary: String(parsed.summary || ""),
    relevance: ["HIGH", "MEDIUM", "LOW", "NOT RELEVANT"].includes(parsed.relevance)
      ? parsed.relevance
      : "LOW",
    why_it_matters: String(parsed.why_it_matters || ""),
    action_items: Array.isArray(parsed.action_items) ? parsed.action_items.map(String) : [],
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String) : [],
  };
}

async function tryGemini(
  circular: Circular,
  content: string,
  chunks?: TextChunk[]
): Promise<AIResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent(buildUserMessage(circular, content, chunks));
  return parseAIResponse(result.response.text());
}

async function tryGroq(
  circular: Circular,
  content: string,
  chunks?: TextChunk[]
): Promise<AIResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(circular, content, chunks) },
    ],
    temperature: 0.2,
    max_tokens: 1024,
  });

  const text = completion.choices[0]?.message?.content || "";
  return parseAIResponse(text);
}

/**
 * Analyse a single circular with Gemini → Groq fallback.
 * Accepts optional pre-structured chunks for richer AI context (PDF pipeline).
 */
export async function processCircular(
  circular: Circular,
  content: string,
  chunks?: TextChunk[]
): Promise<AIResult | null> {
  // Try Gemini first
  try {
    const result = await tryGemini(circular, content, chunks);
    console.log(
      `[processCircular] Gemini OK (${circular.source}, relevance=${result.relevance})`
    );
    return result;
  } catch (err: any) {
    console.warn(`[processCircular] Gemini failed: ${err.message}`);
  }

  // Fallback to Groq
  try {
    const result = await tryGroq(circular, content, chunks);
    console.log(
      `[processCircular] Groq OK (${circular.source}, relevance=${result.relevance})`
    );
    return result;
  } catch (err: any) {
    console.warn(`[processCircular] Groq failed: ${err.message}`);
  }

  return null;
}
