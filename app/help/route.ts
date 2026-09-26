import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

// Serves HELP.html from the app folder: the same file users can double-click offline.
export async function GET() {
  const html = await fs.readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "HELP.html"), "utf8");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
