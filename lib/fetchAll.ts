import { fetchRBI } from "./fetchRBI";
import { fetchIFSCA } from "./fetchIFSCA";
import { fetchMCA } from "./fetchMCA";
import { fetchFATF } from "./fetchFATF";
import { fetchSEBI } from "./fetchSEBI";
import { initDB, insertCirculars, Circular } from "./db";

export interface SourceHealth {
  source: string;
  status: "ok" | "empty" | "error" | "blocked";
  count: number;
  error?: string;
}

export interface FetchAllResult {
  inserted: number;
  total: number;
  sources: SourceHealth[];
}

const FETCHERS: { name: string; fn: () => Promise<Circular[]> }[] = [
  { name: "RBI",   fn: fetchRBI   },
  { name: "IFSCA", fn: fetchIFSCA },
  { name: "MCA",   fn: fetchMCA   },
  { name: "FATF",  fn: fetchFATF  },
  { name: "SEBI",  fn: fetchSEBI  },
];

export async function fetchAll(): Promise<FetchAllResult> {
  initDB();

  const results = await Promise.allSettled(FETCHERS.map((f) => f.fn()));

  const all: Circular[] = [];
  const sources: SourceHealth[] = [];

  for (let i = 0; i < FETCHERS.length; i++) {
    const { name } = FETCHERS[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      const items = result.value;
      all.push(...items);

      // Detect WAF-blocked or genuinely empty
      const errMsg = (items as any)._warning as string | undefined;
      if (items.length === 0 && errMsg) {
        sources.push({ source: name, status: "blocked", count: 0, error: errMsg });
      } else {
        sources.push({
          source: name,
          status: items.length > 0 ? "ok" : "empty",
          count: items.length,
        });
      }
    } else {
      const msg = result.reason?.message ?? "Unknown error";
      console.error(`[fetchAll] ${name} failed:`, msg);
      sources.push({ source: name, status: "error", count: 0, error: msg });
    }
  }

  console.log(`[fetchAll] Total items fetched: ${all.length}`);
  const inserted = insertCirculars(all);
  console.log(`[fetchAll] New items inserted: ${inserted}`);

  return { inserted, total: all.length, sources };
}
