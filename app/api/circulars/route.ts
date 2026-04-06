import { NextResponse } from "next/server";
import { initDB, getAllCirculars } from "@/lib/db";

export async function GET() {
  try {
    initDB();
    const data = getAllCirculars();
    return NextResponse.json({ success: true, count: data.length, data });
  } catch (err: any) {
    console.error("[GET /api/circulars]", err.message);
    return NextResponse.json(
      { success: false, error: "Failed to load circulars", count: 0, data: [] },
      { status: 500 }
    );
  }
}
