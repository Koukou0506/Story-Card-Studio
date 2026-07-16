import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { StyleRiskAnalysisRequestSchema } from "@/domain/style-risk";
import { compareStyleRiskReports } from "@/services/style-risk-service";

export async function POST(request: NextRequest) {
  try { const body = z.object({ before: StyleRiskAnalysisRequestSchema, after: StyleRiskAnalysisRequestSchema }).parse(await request.json()); return NextResponse.json({ comparison: compareStyleRiskReports(body.before, body.after) }); }
  catch (error) { return NextResponse.json({ error: `修订比较失败：${(error as Error).message}` }, { status: 422 }); }
}
