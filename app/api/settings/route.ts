import { z } from "zod";
import { route } from "@/lib/http";
import { getSettings, listDrafts, saveSettings } from "@/lib/store";
import { Settings, type PublicSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

async function publicSettings(): Promise<PublicSettings & { spend: { monthUsd: number; totalUsd: number; calls: number } }> {
  const { apiKey, ...rest } = await getSettings();
  const envKey = process.env.ANTHROPIC_API_KEY ?? "";
  const key = apiKey || envKey;
  const month = new Date().toISOString().slice(0, 7);
  let monthUsd = 0;
  let totalUsd = 0;
  let calls = 0;
  for (const d of await listDrafts()) {
    for (const u of d.usage) {
      totalUsd += u.costUsd;
      calls++;
    }
    if (d.updatedAt.startsWith(month)) monthUsd += d.usage.reduce((n, u) => n + u.costUsd, 0);
  }
  return {
    ...rest,
    apiKeySet: !!key,
    apiKeyHint: key ? `…${key.slice(-4)}` : "",
    apiKeyFromEnv: !apiKey && !!envKey,
    spend: { monthUsd, totalUsd, calls },
  };
}

export const GET = route(async () => publicSettings());

const Update = Settings.partial().extend({ clearKey: z.boolean().optional() });

export const PUT = route(async (req: Request) => {
  const { clearKey, apiKey, ...rest } = Update.parse(await req.json());
  const current = await getSettings();
  await saveSettings({
    ...current,
    ...rest,
    apiKey: clearKey ? "" : apiKey?.trim() ? apiKey.trim() : current.apiKey,
  });
  return publicSettings();
});
