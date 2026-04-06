import * as fs from "fs";

const MIN_USABLE_TEXT = 120; // chars — below this the PDF is likely scanned / image-only

export interface PDFParseResult {
  text: string;
  pages: number;
  isScanned: boolean;
  method: "pdf-parse" | "ocr" | "none";
}

/**
 * Primary: pdf-parse (fast, accurate for digital PDFs).
 * Fallback: tesseract.js OCR (for scanned / image-based PDFs).
 *
 * Production note: tesseract.js works on image buffers (PNG/JPEG), not raw PDF bytes.
 * Full OCR support for scanned PDFs requires converting each page to an image first
 * (e.g., via Playwright screenshot, pdf2pic, or pdfjs-dist + node-canvas).
 * The OCR fallback here will handle files that tesseract can directly interpret.
 */
export async function parsePDF(filePath: string): Promise<PDFParseResult> {
  if (!fs.existsSync(filePath)) {
    return { text: "", pages: 0, isScanned: false, method: "none" };
  }

  const buffer = fs.readFileSync(filePath);

  // ── Step 1: pdf-parse ────────────────────────────────────────────────────
  try {
    // Dynamic import avoids pdf-parse's test-file loader at module init time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (
      b: Buffer,
      opts?: Record<string, unknown>
    ) => Promise<{ text: string; numpages: number }>;

    const data = await pdfParse(buffer, {
      // Disable test-data loading that pollutes logs
      max: 0,
    });

    const text = data.text?.replace(/\s{3,}/g, "\n").trim() ?? "";

    if (text.length >= MIN_USABLE_TEXT) {
      console.log(`[parsePDF] pdf-parse: ${text.length} chars, ${data.numpages} pages`);
      return {
        text: text.slice(0, 10000),
        pages: data.numpages,
        isScanned: false,
        method: "pdf-parse",
      };
    }

    console.warn(
      `[parsePDF] pdf-parse returned only ${text.length} chars — PDF may be image-based`
    );

    // ── Step 2: OCR fallback ───────────────────────────────────────────────
    const ocrText = await tryOCR(buffer);
    if (ocrText.length >= MIN_USABLE_TEXT) {
      return {
        text: ocrText.slice(0, 10000),
        pages: data.numpages,
        isScanned: true,
        method: "ocr",
      };
    }

    // Return what little we have
    return {
      text: text || "[Image-based PDF — full OCR requires page rendering]",
      pages: data.numpages,
      isScanned: true,
      method: text.length > 0 ? "pdf-parse" : "none",
    };
  } catch (err: any) {
    console.error(`[parsePDF] pdf-parse error: ${err.message}`);

    // Last resort: OCR the buffer directly
    const ocrText = await tryOCR(buffer);
    return {
      text: ocrText.slice(0, 10000),
      pages: 0,
      isScanned: true,
      method: ocrText.length > 0 ? "ocr" : "none",
    };
  }
}

async function tryOCR(buffer: Buffer): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");

    console.log("[parsePDF] Attempting OCR...");

    // tesseract.js accepts image buffers (PNG, JPEG, TIFF, BMP).
    // Some PDFs with embedded raster images are handled directly;
    // multi-page PDFs require per-page rendering for full extraction.
    const worker = await createWorker("eng", 1, {
      logger: () => {}, // suppress progress output
    });

    const {
      data: { text },
    } = await worker.recognize(buffer);

    await worker.terminate();

    const result = text?.trim() ?? "";
    console.log(`[parsePDF] OCR extracted ${result.length} chars`);
    return result;
  } catch (err: any) {
    console.warn(`[parsePDF] OCR failed: ${err.message}`);
    return "";
  }
}
