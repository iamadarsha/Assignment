import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { Circular } from "./db";
import { TextChunk, chunksToContext } from "./structureText";

const SYSTEM_PROMPT = `You are a compliance analyst for Glomopay.

Context:
- IFSC-licensed entity in GIFT City, India
- Facilitates outward remittances under the Liberalised Remittance Scheme (LRS)
- Regulated by RBI, IFSCA, and must comply with FEMA and FATF guidelines

Tasks:
1. Summarize the circular in 2-3 sentences
2. Explain why it matters (or doesn't) for Glomopay specifically
3. Assign relevance: HIGH / MEDIUM / LOW / NOT RELEVANT
4. List specific action items Glomopay must or should take
5. Extract 2-3 direct evidence lines from the document text

Output STRICT JSON ONLY:
{
  "summary": "...",
  "relevance": "HIGH | MEDIUM | LOW | NOT RELEVANT",
  "why_it_matters": "...",
  "action_items": ["...", "..."],
  "evidence": ["...", "..."]
}

Do NOT include markdown.
Do NOT include explanations outside JSON.`;

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
