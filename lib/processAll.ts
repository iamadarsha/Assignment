import {
  initDB,
  getUnprocessedCirculars,
  updateCircularAI,
  updateCircularPDF,
} from "./db";
import { extractContent } from "./extractContent";
import { downloadPDF, isPDFUrl } from "./downloadPDF";
import { parsePDF } from "./parsePDF";
import { structureText, TextChunk } from "./structureText";
import { processCircular } from "./processCircular";

interface PipelineResult {
  content: string;
  chunks: TextChunk[];
  isPdf: boolean;
  pdfPath: string | null;
}

/**
 * Determines the best content for a circular:
 * - If URL is a PDF → download, parse, structure
 * - Otherwise → extract HTML text
 */
async function buildContent(id: string, link: string): Promise<PipelineResult> {
  // ── PDF pipeline ──────────────────────────────────────────────────────────
  if (isPDFUrl(link)) {
    const pdfPath = await downloadPDF(link);

    if (pdfPath) {
      const { text, isScanned } = await parsePDF(pdfPath);
      const chunks = structureText(text);

      // Persist PDF metadata immediately
      updateCircularPDF(id, {
        is_pdf: true,
        pdf_path: pdfPath,
        extracted_text: text.slice(0, 10000),
        structured_chunks: JSON.stringify(chunks),
      });

      console.log(
        `[processAll] PDF pipeline: ${text.length} chars, ` +
          `${chunks.length} chunks, scanned=${isScanned}`
      );

      return { content: text, chunks, isPdf: true, pdfPath };
    }

    // PDF download failed → fall through to HTML
    console.warn(`[processAll] PDF download failed for ${link}, falling back to HTML`);
  }

  // ── HTML pipeline ─────────────────────────────────────────────────────────
  const content = await extractContent(link);
  const chunks = structureText(content);

  return { content, chunks, isPdf: false, pdfPath: null };
}

export async function processAll(limit = 5): Promise<{ processed: number; errors: number }> {
  initDB();

  const circulars = getUnprocessedCirculars(limit);
  console.log(`[processAll] ${circulars.length} unprocessed circulars to process`);

  let processed = 0;
  let errors = 0;

  for (const circular of circulars) {
    try {
      console.log(
        `[processAll] → ${circular.source}: ${circular.title.slice(0, 65)}`
      );

      // Step 1: Get content (PDF or HTML)
      const { content, chunks, isPdf, pdfPath } = await buildContent(
        circular.id,
        circular.link
      );

      // Step 2: AI analysis (passes structured chunks for richer context)
      const aiResult = await processCircular(circular, content, chunks);

      if (!aiResult) {
        console.warn(`[processAll] Skipping ${circular.id} — both AI providers failed`);
        errors++;
        continue;
      }

      // Step 3: Persist AI results
      updateCircularAI(circular.id, {
        content: isPdf ? undefined : content.slice(0, 8000),
        ...aiResult,
      });

      processed++;
      console.log(
        `[processAll] ✓ Done — ${circular.source}, relevance=${aiResult.relevance}, ` +
          `pdf=${isPdf}, chunks=${chunks.length}`
      );
    } catch (err: any) {
      console.error(`[processAll] Error on ${circular.id}: ${err.message}`);
      errors++;
    }
  }

  return { processed, errors };
}
