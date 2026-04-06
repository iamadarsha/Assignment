import { NextRequest, NextResponse } from "next/server";
import { initDB } from "@/lib/db";
import { chatWithDocument } from "@/lib/chatDocument";

export async function POST(request: NextRequest) {
  try {
    initDB();

    const body = await request.json();
    const { circularId, question } = body ?? {};

    // ── Input validation ────────────────────────────────────────────────────
    if (!circularId || typeof circularId !== "string") {
      return NextResponse.json(
        { success: false, error: "circularId is required" },
        { status: 400 }
      );
    }
    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: "question must be at least 3 characters" },
        { status: 400 }
      );
    }
    if (question.length > 500) {
      return NextResponse.json(
        { success: false, error: "question must be under 500 characters" },
        { status: 400 }
      );
    }

    const result = await chatWithDocument(circularId, question.trim());
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[POST /api/chat]", err.message);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
