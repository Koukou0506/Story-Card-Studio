// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parsePdfDocument } from "@/services/document-ingestion/pdf-parser";

function makePdf(text?: string): ArrayBuffer {
  const stream = text ? `BT /F1 12 Tf 72 100 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((value, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${value}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(Buffer.from(pdf, "binary")).buffer;
}

describe("PDF document parser", () => {
  it("extracts text-layer content with page and character ranges", async () => {
    const parsed = await parsePdfDocument(makePdf("Chapter 1 Hello world"));
    expect(parsed.status, parsed.errors.join(" | ")).toBe("ready");
    expect(parsed.pageCount).toBe(1);
    expect(parsed.rawText).toContain("Chapter 1 Hello world");
    expect(parsed.pages[0]).toMatchObject({ pageNumber: 1, startOffset: 0 });
    expect(parsed.pages[0].endOffset).toBeGreaterThan(0);
  });

  it("marks image-only or empty-text PDFs as needs_ocr", async () => {
    const parsed = await parsePdfDocument(makePdf());
    expect(parsed.status, parsed.errors.join(" | ")).toBe("needs_ocr");
    expect(parsed.rawText).toBe("");
    expect(parsed.warnings.join(" ")).toContain("OCR");
  });

  it("detects password/encryption markers without retaining a password", async () => {
    const bytes = Uint8Array.from(Buffer.from("%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj", "binary"));
    const parsed = await parsePdfDocument(bytes.buffer);
    expect(parsed.status).toBe("needs_password");
    expect(parsed).not.toHaveProperty("password");
  });
});
