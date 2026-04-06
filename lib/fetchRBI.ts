import axios from "axios";
import { Circular } from "./db";

// RBI publishes dedicated XML RSS feeds per category
// notifications_rss.xml covers circulars and regulatory notifications
const RBI_RSS = "https://rbi.org.in/notifications_rss.xml";

export async function fetchRBI(): Promise<Circular[]> {
  console.log("[RBI] Fetching RSS...");
  try {
    const res = await axios.get(RBI_RSS, { timeout: 15000 });
    const xml: string = res.data;

    // Simple regex parse — avoids xml2js dependency
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    const circulars: Circular[] = items.slice(0, 10).map((item) => {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
        item.match(/<title>(.*?)<\/title>/) || [])[1]?.trim() || "Untitled";

      const link = (item.match(/<link>(.*?)<\/link>/) || [])[1]?.trim() || "";

      const date = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1]?.trim() || "";

      // Strip any embedded HTML tags from title
      const cleanTitle = title.replace(/<[^>]+>/g, "").trim();
      const id = link || `rbi-${Buffer.from(cleanTitle).toString("base64").slice(0, 32)}`;

      return { id, source: "RBI", title: cleanTitle, link, date };
    });

    console.log(`[RBI] Found ${circulars.length} items`);
    return circulars;
  } catch (err: any) {
    console.error("[RBI] Error:", err.message);
    return [];
  }
}
