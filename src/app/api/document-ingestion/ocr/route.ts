import { NextResponse } from "next/server";
import { recognizeScannedPdfWithTesseract } from "@/services/document-ingestion/tesseract-cli-ocr";

const MAX_OCR_BYTES = 50 * 1024 * 1024;
export async function POST(request: Request) {
  try {
    const body = await request.json() as { pdfBase64?: string; languages?: Array<"chi_sim" | "chi_tra" | "eng"> };
    if (!body.pdfBase64) return NextResponse.json({ success: false, error: "缺少 PDF 数据。" }, { status: 400 });
    const data = Buffer.from(body.pdfBase64, "base64"); if (data.byteLength > MAX_OCR_BYTES) return NextResponse.json({ success: false, error: "PDF 超过 OCR 大小上限。" }, { status: 413 });
    if (!data.subarray(0, 5).equals(Buffer.from("%PDF-"))) return NextResponse.json({ success: false, error: "文件签名不是 PDF。" }, { status: 415 });
    const results = await recognizeScannedPdfWithTesseract(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), { languages: body.languages?.length ? body.languages : ["chi_sim"] });
    return NextResponse.json({ success: true, data: results });
  } catch (error) { return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 }); }
}
