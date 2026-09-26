import { z } from "zod";
import { route } from "@/lib/http";
import { getSettings, listDrafts, saveSettings } from "@/lib/store";
import { Settings, type PublicSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

async function publicSettings(): Promise<PublicSettings & { spend: { monthUsd: number; totalUsd: number; calls: number } }> {
  const { apiKey, openrouterApiKey, ...rest } = await getSettings();
  const envKey = process.env.ANTHROPIC_API_KEY ?? "";
  const key = apiKey || envKey;
  const orEnv = process.env.OPENROUTER_API_KEY ?? "";
  const orKey = openrouterApiKey || orEnv;
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
    openrouterKeySet: !!orKey,
    openrouterKeyHint: orKey ? `…${orKey.slice(-4)}` : "",
    openrouterKeyFromEnv: !openrouterApiKey && !!orEnv,
    anyProvider: !!key || (!!orKey && rest.openrouterEnabled),
    spend: { monthUsd, totalUsd, calls },
  };
}

export const GET = route(async () => publicSettings());

const Update = Settings.partial().extend({ clearKey: z.boolean().optional(), clearOpenrouterKey: z.boolean().optional() });

export const PUT = route(async (req: Request) => {
  const { clearKey, apiKey, clearOpenrouterKey, openrouterApiKey, ...rest } = Update.parse(await req.json());
  const current = await getSettings();
  await saveSettings({
    ...current,
    ...rest,
    apiKey: clearKey ? "" : apiKey?.trim() ? apiKey.trim() : current.apiKey,
    openrouterApiKey: clearOpenrouterKey ? "" : openrouterApiKey?.trim() ? openrouterApiKey.trim() : current.openrouterApiKey,
  });
  return publicSettings();
});
