import { NextResponse } from "next/server";
import { setReviewed } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, reviewed } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { success: false, error: "id is required" },
        { status: 400 }
      );
    }
    if (typeof reviewed !== "boolean") {
      return NextResponse.json(
        { success: false, error: "reviewed must be boolean" },
        { status: 400 }
      );
    }

    setReviewed(id, reviewed);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[POST /api/review]", err.message);
    return NextResponse.json(
      { success: false, error: "Failed to update review status" },
      { status: 500 }
    );
  }
}
