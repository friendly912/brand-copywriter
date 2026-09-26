"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { PALETTE_ROLES, type Brand, type PaletteColor } from "@/lib/types";
import { useToast } from "../ui";

const HEX = /^#[0-9a-f]{6}$/i;

export function RulesTab({ brand, onSaved }: { brand: Brand; onSaved: () => Promise<void> }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(brand.name);
  const [description, setDescription] = useState(brand.description);
  const [audience, setAudience] = useState(brand.audience);
  const [platform, setPlatform] = useState(brand.platform);
  const [palette, setPalette] = useState<PaletteColor[]>(brand.palette);
  const [rules, setRules] = useState(brand.rules);
  const [banned, setBanned] = useState(brand.rules.bannedWords.join(", "));
  const [other, setOther] = useState(brand.rules.other.join("\n"));
  const [error, setError] = useState("");

  const badHex = palette.some((c) => !HEX.test(c.hex));

  async function save() {
    setError("");
    try {
      await api(`/api/brands/${brand.id}`, {
        method: "PUT",
        json: {
          name,
          description,
          audience,
          platform,
          palette,
          rules: {
            ...rules,
            bannedWords: banned.split(/[,\n]/).map((w) => w.trim()).filter(Boolean),
            other: other.split("\n").map((w) => w.trim()).filter(Boolean),
          },
        },
      });
      await onSaved();
      toast.show("Saved");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const setColor = (i: number, patch: Partial<PaletteColor>) => setPalette(palette.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 760 }}>
      {toast.node}
      <div className="card stack">
        <h2>Brand</h2>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>What the brand is</span>
          <small>Context Claude gets on every email: what it sells, who it's for.</small>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="field">
          <span>Audience</span>
          <small>Who the emails are for. A brief can still target a narrower segment.</small>
          <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. US e-commerce shoppers aged 25–40" />
        </label>
        <label className="field" style={{ maxWidth: 300 }}>
          <span>Email platform</span>
          <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="e.g. Klaviyo" list="platforms" />
          <datalist id="platforms">
            {["Klaviyo", "Mailchimp", "Shopify Email", "Omnisend", "HubSpot", "Brevo"].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="card stack">
        <div>
          <h2>Colour palette</h2>
          <p className="muted small" style={{ marginTop: 4 }}>
            Used in the design notes that come with each email, such as “CTA button in Coral #FF6B5A”.
          </p>
        </div>
        {palette.map((c, i) => (
          <div key={i} className="palette-row">
            <input type="color" value={HEX.test(c.hex) ? c.hex : "#000000"} onChange={(e) => setColor(i, { hex: e.target.value.toUpperCase() })} />
            <input value={c.name} placeholder="Name, e.g. Coral" onChange={(e) => setColor(i, { name: e.target.value })} />
            <input value={c.hex} placeholder="#FF6B5A" onChange={(e) => setColor(i, { hex: e.target.value.trim() })} style={{ fontFamily: "var(--mono)" }} />
            <select value={c.role} onChange={(e) => setColor(i, { role: e.target.value as PaletteColor["role"] })}>
              {PALETTE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button className="btn ghost sm" onClick={() => setPalette(palette.filter((_, j) => j !== i))} title="Remove">
              ✕
            </button>
          </div>
        ))}
        {badHex && <p className="small" style={{ color: "var(--warn)" }}>Hex colours must look like #FF6B5A.</p>}
        <div>
          <button className="btn sm" onClick={() => setPalette([...palette, { name: "", hex: "#3B5BDB", role: palette.length ? "accent" : "primary" }])}>
            + Add colour
          </button>
        </div>
      </div>

      <div className="card stack">
        <div>
          <h2>Hard rules</h2>
          <p className="muted small" style={{ marginTop: 4 }}>
            These always apply, and every draft is checked against them.
          </p>
        </div>
        <label className="field">
          <span>Banned words or phrases</span>
          <small>Comma-separated</small>
          <input value={banned} onChange={(e) => setBanned(e.target.value)} placeholder="cheap, hurry, act now" />
        </label>
        <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
          <label className="field" style={{ width: 200 }}>
            <span>Emoji</span>
            <select value={rules.emoji} onChange={(e) => setRules({ ...rules, emoji: e.target.value as Brand["rules"]["emoji"] })}>
              <option value="never">Never</option>
              <option value="sparingly">Sparingly</option>
              <option value="free">Freely, like the examples</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Sign-off</span>
            <input value={rules.signOff} onChange={(e) => setRules({ ...rules, signOff: e.target.value })} placeholder="e.g. Love, Mia" />
          </label>
        </div>
        <div className="row" style={{ gap: 16 }}>
          <label className="field" style={{ width: 160 }}>
            <span>Subject max chars</span>
            <input type="number" min={10} value={rules.subjectMaxChars} onChange={(e) => setRules({ ...rules, subjectMaxChars: Number(e.target.value) || 60 })} />
          </label>
          <label className="field" style={{ width: 160 }}>
            <span>Preview min chars</span>
            <input type="number" min={0} value={rules.previewMinChars} onChange={(e) => setRules({ ...rules, previewMinChars: Number(e.target.value) || 0 })} />
          </label>
          <label className="field" style={{ width: 160 }}>
            <span>Preview max chars</span>
            <input type="number" min={10} value={rules.previewMaxChars} onChange={(e) => setRules({ ...rules, previewMaxChars: Number(e.target.value) || 110 })} />
          </label>
        </div>
        <label className="field">
          <span>Other rules</span>
          <small>One per line, e.g. “Always mention free shipping over $50” or “Never promise results”</small>
          <textarea rows={3} value={other} onChange={(e) => setOther(e.target.value)} />
        </label>
      </div>

      {error && <div className="banner err">{error}</div>}
      <div className="row between">
        <button className="btn primary" disabled={!name.trim() || badHex} onClick={save}>
          Save
        </button>
        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm(`Delete ${brand.name} with all its emails, profile versions and drafts? This can't be undone.`)) return;
            await api(`/api/brands/${brand.id}`, { method: "DELETE" });
            router.push("/");
          }}
        >
          Delete brand
        </button>
      </div>
    </div>
  );
}
