import { DOC_EXTENSIONS, docToText } from "@/lib/ai/ingest";
import { route, type Ctx } from "@/lib/http";
import { getBrand, newId, now, saveDoc, saveUpload } from "@/lib/store";
import { DOC_KINDS, type BrandDoc, type DocKind } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAX_FILE_BYTES = 30 * 1024 * 1024;

/**
 * Adds brand documents. Multipart form data:
 *   files[]         - PDF / .docx / .txt / .md / .html / images
 *   text + title    - pasted document
 *   kind            - style_guide | product_info | other
 *   useWhenWriting  - "false" to use it only for building the profile
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const brand = await getBrand(id);
  const form = await req.formData();
  const kindField = String(form.get("kind") ?? "other");
  const kind: DocKind = (DOC_KINDS as readonly string[]).includes(kindField) ? (kindField as DocKind) : "other";
  const useWhenWriting = form.get("useWhenWriting") !== "false";

  const created: BrandDoc[] = [];
  const failed: { name: string; error: string }[] = [];

  const add = async (title: string, fileName: string | null, get: () => Promise<string>) => {
    try {
      const content = await get();
      if (!content.trim()) throw new Error("No text found in this document.");
      const doc: BrandDoc = { id: newId("doc"), brandId: brand.id, kind, title, content, fileName, useWhenWriting, createdAt: now() };
      await saveDoc(doc);
      created.push(doc);
    } catch (err) {
      failed.push({ name: title, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const text = String(form.get("text") ?? "");
  if (text.trim()) {
    const title = String(form.get("title") ?? "").trim() || "Pasted document";
    await add(title, null, async () => text.trim());
  }

  for (const f of form.getAll("files")) {
    if (typeof f === "string") continue;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (f.size > MAX_FILE_BYTES) {
      failed.push({ name: f.name, error: "File is larger than 30 MB." });
      continue;
    }
    if (!DOC_EXTENSIONS.includes(ext) && ext !== "doc") {
      failed.push({ name: f.name, error: `Unsupported file type ".${ext}". Use PDF, .docx, .txt, .md, .html or an image.` });
      continue;
    }
    const data = Buffer.from(await f.arrayBuffer());
    await add(f.name.replace(/\.[^.]+$/, ""), f.name, async () => {
      const content = await docToText(f.name, data);
      await saveUpload(brand.id, f.name, data);
      return content;
    });
  }

  return { created, failed };
});
