import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PersonalStyleBaselineSchema } from "@/domain/style-risk";
import { createPersonalStyleBaseline, personalStyleBaselineStore } from "@/services/style-risk-baselines";

export async function GET() { return NextResponse.json({ baselines: personalStyleBaselineStore.list() }); }
export async function POST(request: NextRequest) {
  try {
    const input = z.object({ name: z.string().min(1).max(120), text: z.string().min(1).max(500_000), genre: z.string().max(120).optional(), pointOfView: z.string().max(120).optional(), sampleScope: z.string().max(240).optional() }).parse(await request.json());
    return NextResponse.json({ baseline: personalStyleBaselineStore.save(createPersonalStyleBaseline(input)) }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: `个人基准创建失败：${(error as Error).message}` }, { status: 422 }); }
}
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? ""; if (!id) return NextResponse.json({ error: "缺少基准 ID。" }, { status: 400 });
  return NextResponse.json({ deleted: personalStyleBaselineStore.delete(id) });
}

export const BaselineResponseSchema = PersonalStyleBaselineSchema;
