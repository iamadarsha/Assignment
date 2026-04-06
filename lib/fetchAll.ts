import { fetchRBI } from "./fetchRBI";
import { fetchIFSCA } from "./fetchIFSCA";
import { fetchMCA } from "./fetchMCA";
import { fetchFATF } from "./fetchFATF";
import { fetchSEBI } from "./fetchSEBI";
import { initDB, insertCirculars, Circular } from "./db";

export async function fetchAll(): Promise<{ inserted: number; total: number }> {
  initDB();

  const results = await Promise.allSettled([
    fetchRBI(),
    fetchIFSCA(),
    fetchMCA(),
    fetchFATF(),
    fetchSEBI(),
  ]);

  const all: Circular[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
  }

  console.log(`[fetchAll] Total items fetched: ${all.length}`);
  const inserted = insertCirculars(all);
  console.log(`[fetchAll] New items inserted: ${inserted}`);

  return { inserted, total: all.length };
}
