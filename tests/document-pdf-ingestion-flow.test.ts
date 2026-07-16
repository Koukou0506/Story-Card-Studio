// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MemoryDocumentAssetStorage } from "@/storage/document-assets";
import { ingestLocalDocumentFile } from "@/services/document-ingestion/pipeline";

function textPdf(text: string): ArrayBuffer {
  const stream = `BT /F1 12 Tf 72 100 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((value, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(Buffer.from(pdf, "binary")).buffer;
}

describe("text-layer PDF ingestion flow", () => {
  it("preserves page-backed Source Spans through parsing, cleaning and chunking", async () => {
    const storage = new MemoryDocumentAssetStorage();
    const bytes = textPdf("Chapter 1 The visitor enters town.");
    const file = new File([bytes], "story.pdf", { type: "application/pdf" });
    const result = await ingestLocalDocumentFile({ file, projectId: "project-1", permissionConfirmed: true, storage });

    expect(result.source.processingStatus).toBe("ready_for_review");
    expect(result.source.pageCount).toBe(1);
    expect(result.chapters).toHaveLength(1);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0].sourceSpans[0].pageStart).toBe(1);
    expect(result.chunks[0].sourceSpans[0].rawTextExcerpt).toContain("visitor");
  });
});
