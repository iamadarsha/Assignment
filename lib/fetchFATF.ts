import axios from "axios";
import { Circular } from "./db";

// FATF RSS feed for publications
const FATF_RSS = "https://www.fatf-gafi.org/en/publications.rss";
const BASE_URL = "https://www.fatf-gafi.org";

export async function fetchFATF(): Promise<Circular[]> {
  console.log("[FATF] Fetching RSS feed...");
  try {
    const res = await axios.get(FATF_RSS, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; regulatory-intel/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    const xml: string = res.data;
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    const circulars: Circular[] = items.slice(0, 10).map((item) => {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
        item.match(/<title>(.*?)<\/title>/) || [])[1]?.trim() || "Untitled";

      const link = (item.match(/<link>(.*?)<\/link>/) || [])[1]?.trim() || "";
      const date = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1]?.trim() || "";

      const cleanTitle = title.replace(/<[^>]+>/g, "").trim();
      const fullLink = link.startsWith("http")
        ? link
        : `${BASE_URL}${link.startsWith("/") ? "" : "/"}${link}`;
      const id = fullLink || `fatf-${Buffer.from(cleanTitle).toString("base64").slice(0, 32)}`;

      return { id, source: "FATF", title: cleanTitle, link: fullLink, date };
    });

    console.log(`[FATF] Found ${circulars.length} items`);
    return circulars;
  } catch (err: any) {
    console.error("[FATF] Error:", err.message);
    return [];
  }
}
