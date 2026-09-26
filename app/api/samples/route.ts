import { z } from "zod";
import { route } from "@/lib/http";
import { importSample, listSamples } from "@/lib/samples";

export const dynamic = "force-dynamic";

export const GET = route(async () => listSamples());

/** Import sample brands: { ids?: string[] (default: all), withProfiles?: boolean (default true) } */
export const POST = route(async (req: Request) => {
  const input = z.object({ ids: z.array(z.string()).optional(), withProfiles: z.boolean().default(true) }).parse(await req.json().catch(() => ({})));
  const all = await listSamples();
  const ids = input.ids ?? all.map((s) => s.id);
  const results = [];
  for (const id of ids) {
    if (!all.some((s) => s.id === id)) {
      results.push({ id, error: "Unknown sample" });
      continue;
    }
    try {
      results.push(await importSample(id, input.withProfiles));
    } catch (err) {
      results.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { results };
});
