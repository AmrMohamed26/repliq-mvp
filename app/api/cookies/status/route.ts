import { NextResponse } from "next/server";
import { getCookieStatusReport } from "@/lib/site-cookies";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await getCookieStatusReport();
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      {
        platforms: [],
        needsAttention: true,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
