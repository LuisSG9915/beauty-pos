import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDatabase } from "@/db/client";

/**
 * Warm-up de Hyperdrive: ejecuta una consulta trivial para mantener el pool
 * de conexiones caliente. Llamado por el cron cada 15 min.
 * Protegido por CRON_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getDatabase();
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[warmup] error:", error);
    return NextResponse.json({ error: "Warmup failed" }, { status: 500 });
  }
}
