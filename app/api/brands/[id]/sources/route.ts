import { detectType, emlToCopy, htmlToCopy, imageToCopy, isImage, parsePastedText, type IngestedEmail } from "@/lib/ai/ingest";
import { route, type Ctx } from "@/lib/http";
import { getBrand, newId, now, saveSource, saveUpload } from "@/lib/store";
import { EMAIL_TYPES, type EmailType, type SourceEmail } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE_BYTES = 15 * 1024 * 1024;

async function extract(fileName: string, data: Buffer): Promise<IngestedEmail> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (isImage(fileName)) return imageToCopy(fileName, data);
  const text = data.toString("utf8");
  if (ext === "eml") return { ...(await emlToCopy(data)), emailType: null };
  if (ext === "html" || ext === "htm") return { ...htmlToCopy(text), emailType: null };
  if (ext === "txt" || ext === "md") return { ...parsePastedText(text), emailType: null };
  throw new Error(`Unsupported file type ".${ext}". Use .html, .eml, .txt, .md, .png, .jpg or .webp.`);
}

/**
 * Adds past emails. Accepts multipart form data with any mix of:
 *   files[]  - .html / .eml / .txt / .md / screenshots
 *   text     - pasted email copy (may start with "Subject:" / "Preview:" lines)
 *   emailType - one of EMAIL_TYPES, or "auto" to let Claude pick
 *   favorite - "true" to mark as a favourite example
 *   note     - optional performance result, e.g. "32% CTR"
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const { id } = await params;
  const brand = await getBrand(id);
  const form = await req.formData();
  const typeField = String(form.get("emailType") ?? "auto");
  const chosenType = (EMAIL_TYPES as readonly string[]).includes(typeField) ? (typeField as EmailType) : null;
  const favorite = form.get("favorite") === "true";
  const note = String(form.get("note") ?? "").trim();

  const created: SourceEmail[] = [];
  const failed: { name: string; error: string }[] = [];

  const add = async (name: string | null, get: () => Promise<IngestedEmail>) => {
    try {
      const got = await get();
      if (!got.body.trim()) throw new Error("No text found in this email.");
      const emailType = chosenType ?? got.emailType ?? (await detectType(got));
      const source: SourceEmail = {
        id: newId("src"),
        brandId: brand.id,
        emailType,
        subject: got.subject,
        preview: got.preview,
        body: got.body,
        origin: "upload",
        fileName: name,
        favorite,
        note,
        createdAt: now(),
      };
      await saveSource(source);
      created.push(source);
    } catch (err) {
      failed.push({ name: name ?? "Pasted text", error: err instanceof Error ? err.message : String(err) });
    }
  };

  const text = String(form.get("text") ?? "");
  if (text.trim()) await add(null, async () => ({ ...parsePastedText(text), emailType: null }));

  for (const f of form.getAll("files")) {
    if (typeof f === "string") continue;
    if (f.size > MAX_FILE_BYTES) {
      failed.push({ name: f.name, error: "File is larger than 15 MB." });
      continue;
    }
    const data = Buffer.from(await f.arrayBuffer());
    await add(f.name, async () => {
      const got = await extract(f.name, data);
      await saveUpload(brand.id, f.name, data); // keep the original next to the extracted copy
      return got;
    });
  }

  return { created, failed };
});
