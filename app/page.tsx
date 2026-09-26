"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SamplesPanel } from "@/components/SamplesPanel";
import { api, fmtDate } from "@/lib/client";
import type { Brand } from "@/lib/types";

type BrandRow = Brand & { sourceCount: number; draftCount: number; lastUsed: string | null };

export default function BrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<BrandRow[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const reload = () => api<BrandRow[]>("/api/brands").then(setBrands).catch((e) => setError(e.message));

  useEffect(() => {
    reload();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const b = await api<Brand>("/api/brands", { method: "POST", json: { name, description } });
      router.push(`/brands/${b.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Brands</h1>
          <p className="sub">Each brand has its own voice, learned from its past emails.</p>
        </div>
        <div className="row">
          {!showSamples && (
            <button className="btn" onClick={() => setShowSamples(true)}>
              Load sample brands
            </button>
          )}
          {!creating && (
            <button className="btn primary" onClick={() => setCreating(true)}>
              + New brand
            </button>
          )}
        </div>
      </div>

      {error && <div className="banner err" style={{ marginBottom: 16 }}>{error}</div>}

      {showSamples && <SamplesPanel onDone={reload} onClose={() => setShowSamples(false)} />}

      {creating && (
        <form className="card stack" style={{ marginBottom: 20, maxWidth: 560 }} onSubmit={create}>
          <h2>New brand</h2>
          <label className="field">
            <span>Name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Luna Skincare" />
          </label>
          <label className="field">
            <span>What the brand is (optional)</span>
            <small>One or two lines of context: what it sells, who it's for.</small>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Clean skincare for sensitive skin, women 25–40, premium but friendly." />
          </label>
          <div className="row">
            <button className="btn primary" disabled={!name.trim()}>
              Create brand
            </button>
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {brands === null && !error && <p className="muted">Loading…</p>}

      {brands?.length === 0 && !creating && (
        <div className="empty">
          <h3>No brands yet</h3>
          <p>Create a brand, add a few of its past emails, and build its voice profile. Then write emails in that voice.</p>
          <div className="row" style={{ marginTop: 14, justifyContent: "center" }}>
            <button className="btn primary" onClick={() => setCreating(true)}>
              + New brand
            </button>
            {!showSamples && (
              <button className="btn" onClick={() => setShowSamples(true)}>
                Try with sample brands
              </button>
            )}
          </div>
        </div>
      )}

      {!!brands?.length && (
        <div className="grid">
          {brands.map((b) => (
            <div key={b.id} className="card stack tight">
              <div className="row between">
                <Link href={`/brands/${b.id}`} style={{ color: "inherit" }}>
                  <h2>{b.name}</h2>
                </Link>
                <div className="swatches">
                  {b.palette.slice(0, 6).map((c, i) => (
                    <span key={i} className="swatch" style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />
                  ))}
                </div>
              </div>
              {b.description && <p className="muted small">{b.description}</p>}
              <div className="row small" style={{ marginTop: 4 }}>
                <span className="badge">{b.sourceCount} past emails</span>
                {b.activeProfileVersion ? <span className="badge ok">Profile v{b.activeProfileVersion}</span> : <span className="badge warn">No profile yet</span>}
                <span className="badge">{b.draftCount} drafts</span>
                {b.sampleId && <span className="badge accent">Sample</span>}
              </div>
              {b.lastUsed && <p className="faint small">Last used {fmtDate(b.lastUsed)}</p>}
              <div className="row" style={{ marginTop: 8 }}>
                <Link className="btn primary sm" href={`/brands/${b.id}/write`}>
                  Write email
                </Link>
                <Link className="btn sm" href={`/brands/${b.id}`}>
                  Set up voice
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
