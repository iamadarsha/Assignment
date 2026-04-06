import axios from "axios";
import * as cheerio from "cheerio";

const MAX_CHARS = 4000;

export async function extractContent(url: string): Promise<string> {
  if (!url) return "";

  try {
    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      responseType: "text",
      maxRedirects: 5,
    });

    const contentType: string = res.headers["content-type"] || "";

    // If it's a PDF or binary, return empty (can't parse without PDF library)
    if (contentType.includes("pdf") || contentType.includes("octet-stream")) {
      return "[PDF document — content extraction not supported]";
    }

    const $ = cheerio.load(res.data as string);

    // Remove non-content elements
    $("nav, header, footer, script, style, iframe, noscript, .nav, .menu, .sidebar, .advertisement").remove();

    // Try to find main content area first
    const mainSelectors = ["main", "article", ".content", "#content", ".main-content", "#main", ".body-content"];
    let text = "";

    for (const sel of mainSelectors) {
      const el = $(sel);
      if (el.length) {
        text = el.text();
        break;
      }
    }

    // Fall back to body
    if (!text.trim()) {
      text = $("body").text();
    }

    // Normalize whitespace
    text = text
      .replace(/\t/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return text.slice(0, MAX_CHARS);
  } catch (err: any) {
    console.warn(`[extractContent] Failed for ${url}: ${err.message}`);
    return "";
  }
}
