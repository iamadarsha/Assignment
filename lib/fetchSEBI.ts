import axios from "axios";
import * as cheerio from "cheerio";
import { Circular } from "./db";

// SEBI circulars listing page
// Note: sebi.gov.in may block non-browser requests via WAF.
// The correct scraping logic is implemented; fails gracefully when blocked.
const SEBI_URL = "https://www.sebi.gov.in/legal/circulars/";
const BASE_URL = "https://www.sebi.gov.in";

function resolveUrl(href: string): string {
  if (href.startsWith("http")) return href;
  return `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

function makeId(link: string): string {
  return `sebi-${Buffer.from(link).toString("base64").slice(0, 40)}`;
}

export async function fetchSEBI(): Promise<Circular[]> {
  console.log("[SEBI] Fetching circulars page...");
  try {
    const res = await axios.get(SEBI_URL, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.sebi.gov.in/",
      },
    });

    const $ = cheerio.load(res.data);
    const circulars: Circular[] = [];

    // SEBI renders circulars in a <table> — rows have date + title/link columns
    $("table tr").each((_, row) => {
      if (circulars.length >= 10) return;

      const cells = $(row).find("td");
      if (cells.length < 2) return;

      // Title + link are typically in the last <td> that has an <a>
      const linkEl = cells.find("a[href]").first();
      const title = linkEl.text().trim();
      const href = linkEl.attr("href") || "";

      if (!title || title.length < 8 || !href) return;

      // Date is typically in the first or second cell
      const dateText = $(cells[0]).text().trim() || $(cells[1]).text().trim();

      const link = resolveUrl(href);
      circulars.push({ id: makeId(link), source: "SEBI", title, link, date: dateText });
    });

    // Fallback: anchor scan for PDF or circular links when table parsing yields nothing
    if (circulars.length === 0) {
      $("a[href]").each((_, el) => {
        if (circulars.length >= 10) return;
        const href = $(el).attr("href") || "";
        const title = $(el).text().trim();
        if (!title || title.length < 10) return;
        if (
          !href.match(/\.pdf$/i) &&
          !href.toLowerCase().includes("circular") &&
          !href.toLowerCase().includes("sebi")
        )
          return;

        const link = resolveUrl(href);
        const parent = $(el).closest("tr, li, div");
        const date = parent.find("time").attr("datetime") || parent.find(".date").text().trim() || "";

        circulars.push({ id: makeId(link), source: "SEBI", title, link, date });
      });
    }

    console.log(`[SEBI] Found ${circulars.length} items`);
    return circulars;
  } catch (err: any) {
    const status = err.response?.status;
    if (status === 403) {
      console.warn("[SEBI] Blocked by WAF (HTTP 403). Production use requires headless browser.");
    } else {
      console.error("[SEBI] Error:", err.message);
    }
    return [];
  }
}
