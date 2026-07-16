import { NextResponse } from "next/server";
import { getTesseractCliAvailability } from "@/services/document-ingestion/tesseract-cli-ocr";

export async function GET() { return NextResponse.json(await getTesseractCliAvailability()); }
