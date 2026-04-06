import axios from "axios";
import { Circular } from "./db";

// IFSCA uses a DataTables-backed JSON API.
// EncryptedId = "wF6kttc1JR8=" selects the "Circular" document type.
const IFSCA_API = "https://ifsca.gov.in/Legal/GetLegalData";
const ENCRYPTED_ID = "wF6kttc1JR8=";
const BASE_URL = "https://ifsca.gov.in";

interface IFSCAItem {
  LegalId: number;
  Title: string;
  PublishDate: string;
  PhotoFileID: string;
  PhotoFileName: string;
}

export async function fetchIFSCA(): Promise<Circular[]> {
  console.log("[IFSCA] Fetching circulars via JSON API...");
  try {
    const res = await axios.get(IFSCA_API, {
      timeout: 15000,
      params: {
        PageNumber: 1,
        PageSize: 10,
        EncryptedId: ENCRYPTED_ID,
        SortCol: "PublishDate",
        SortType: "desc",
      },
      headers: {
        Accept: "application/json",
        Referer: `${BASE_URL}/Legal/Index/${ENCRYPTED_ID}`,
        "User-Agent": "Mozilla/5.0 (compatible; regulatory-intel/1.0)",
      },
    });

    const list: IFSCAItem[] =
      res.data?.data?.LegalMasterModelList || [];

    const circulars: Circular[] = list.map((item) => {
      const link = `${BASE_URL}/CommonDirect/GetFileView?id=${item.PhotoFileID}&fileName=${item.PhotoFileName}&TitleName=Legal`;
      return {
        id: `ifsca-${item.LegalId}`,
        source: "IFSCA",
        title: item.Title || "Untitled",
        link,
        date: item.PublishDate || "",
      };
    });

    console.log(`[IFSCA] Found ${circulars.length} items`);
    return circulars;
  } catch (err: any) {
    console.error("[IFSCA] Error:", err.message);
    return [];
  }
}
