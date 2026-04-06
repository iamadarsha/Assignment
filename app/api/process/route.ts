import { NextResponse } from "next/server";
import { processAll } from "@/lib/processAll";

export async function POST() {
  try {
    const result = await processAll(5);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[POST /api/process]", err.message);
    return NextResponse.json(
      { success: false, error: "Processing failed", processed: 0, errors: 0 },
      { status: 500 }
    );
  }
}
