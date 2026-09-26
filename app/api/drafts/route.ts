import { route } from "@/lib/http";
import { listBrands, listDrafts } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const brandId = new URL(req.url).searchParams.get("brandId") ?? undefined;
  const [drafts, brands] = await Promise.all([listDrafts(brandId), listBrands()]);
  const names = new Map(brands.map((b) => [b.id, b.name]));
  return drafts.map((d) => ({
    id: d.id,
    brandId: d.brandId,
    brandName: names.get(d.brandId) ?? "(deleted brand)",
    emailType: d.brief.emailType,
    goal: d.brief.goal || d.brief.offer,
    subject: d.current.subject_lines[d.chosenSubject]?.text ?? d.current.subject_lines[0]?.text ?? "",
    headline: d.current.headline,
    status: d.status,
    costUsd: d.usage.reduce((n, u) => n + u.costUsd, 0),
    updatedAt: d.updatedAt,
  }));
});
