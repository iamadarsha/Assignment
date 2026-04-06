import { NextResponse } from "next/server";
import { fetchAll } from "@/lib/fetchAll";

export async function POST() {
  try {
    const result = await fetchAll();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[POST /api/fetch]", err.message);
    return NextResponse.json(
      { success: false, error: "Fetch failed", inserted: 0, total: 0 },
      { status: 500 }
    );
  }
}
