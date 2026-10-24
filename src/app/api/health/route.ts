import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDatabase } from "@/db/client";

export const dynamic = "force-dynamic";

/**
 * Readiness check para monitoreo/deploys: confirma que la app responde y que
 * la base de datos es alcanzable. Sin datos sensibles.
 */
export async function GET() {
  try {
    const db = getDatabase();
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { ok: true, status: "healthy" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, status: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
