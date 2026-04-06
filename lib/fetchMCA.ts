import axios from "axios";
import * as cheerio from "cheerio";
import { Circular } from "./db";

// MCA notifications page (AEM-based CMS)
// NOTE: www.mca.gov.in is protected by Akamai WAF and blocks non-browser requests.
// Production deployment should use headless browser (Playwright) for this source.
// This fetcher implements the correct scraping logic and fails gracefully when blocked.
const MCA_URL =
  "https://www.mca.gov.in/content/mca/global/en/acts-rules/ebooks/notifications.html";

export async function fetchMCA(): Promise<Circular[]> {
  console.log("[MCA] Fetching notifications page...");
  try {
    const res = await axios.get(MCA_URL, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const $ = cheerio.load(res.data);
    const circulars: Circular[] = [];

    // MCA uses AEM accordion components; notifications appear as links in list items
    $("a[href]").each((_, el) => {
      if (circulars.length >= 10) return;

      const title = $(el).text().trim();
      const href = $(el).attr("href") || "";

      if (!title || title.length < 10) return;
      if (!href.match(/\.(pdf|html?)$/i) && !href.includes("notification")) return;

      const link = href.startsWith("http")
        ? href
        : `https://www.mca.gov.in${href.startsWith("/") ? "" : "/"}${href}`;

      const dateText = $(el).closest("tr, li").find("td, .date").first().text().trim();

      circulars.push({
        id: link,
        source: "MCA",
        title,
        link,
        date: dateText,
      });
    });

    console.log(`[MCA] Found ${circulars.length} items`);
    return circulars;
  } catch (err: any) {
    // Akamai WAF returns 403 for server-side requests; Playwright required in production
    const status = err.response?.status;
    if (status === 403) {
      console.warn(
        "[MCA] Blocked by Akamai WAF (HTTP 403). Production use requires headless browser."
      );
    } else {
      console.error("[MCA] Error:", err.message);
    }
    return [];
  }
}
