import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const PDF_DIR = path.join(process.cwd(), "data", "pdfs");

/**
 * Known PDF-serving URL patterns for sources that don't use .pdf extensions.
 * Add patterns here as new sources are integrated.
 */
const PDF_URL_PATTERNS: RegExp[] = [
  /\.pdf(\?.*)?$/i,
  /GetFileView/i,           // IFSCA: /CommonDirect/GetFileView?id=...
  /\/Download\?/i,          // Generic download endpoints
  /\/document\//i,          // Document endpoints
];

/** Returns true if the URL strongly suggests a PDF (by extension or known pattern). */
export function isPDFUrl(url: string): boolean {
  return PDF_URL_PATTERNS.some((p) => p.test(url));
}

/**
 * Downloads a PDF from `url`, caches it under /data/pdfs/<md5>.pdf.
 * Returns the local file path, or null on failure / non-PDF response.
 */
export async function downloadPDF(url: string): Promise<string | null> {
  try {
    fs.mkdirSync(PDF_DIR, { recursive: true });

    const hash = crypto.createHash("md5").update(url).digest("hex");
    const filePath = path.join(PDF_DIR, `${hash}.pdf`);

    // Return cached copy
    if (fs.existsSync(filePath)) {
      console.log(`[downloadPDF] Using cached: ${hash}.pdf`);
      return filePath;
    }

    console.log(`[downloadPDF] Downloading: ${url}`);
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/pdf,*/*",
      },
      maxRedirects: 5,
    });

    const contentType: string = res.headers["content-type"] || "";
    if (!contentType.includes("pdf") && !isPDFUrl(url)) {
      console.warn(`[downloadPDF] Not a PDF (Content-Type: ${contentType})`);
      return null;
    }

    fs.writeFileSync(filePath, Buffer.from(res.data));
    console.log(`[downloadPDF] Saved: ${hash}.pdf (${res.data.byteLength} bytes)`);
    return filePath;
  } catch (err: any) {
    console.warn(`[downloadPDF] Failed for ${url}: ${err.message}`);
    return null;
  }
}
