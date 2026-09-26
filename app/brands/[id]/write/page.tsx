"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { DraftEditor } from "@/components/write/DraftEditor";
import { BriefForm } from "@/components/write/BriefForm";
import { Progress } from "@/components/ui";
import type { BrandData } from "@/components/brand/types";
import { api, ApiError, streamJob, type JobProgress } from "@/lib/client";
import { Brief, type Brand, type BrandProfile, type Draft } from "@/lib/types";

function WriteScreen() {
  const { id: brandId } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const draftId = search.get("draft");

  const [brand, setBrand] = useState<Brand | null>(null);
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [sourceCount, setSourceCount] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [brief, setBrief] = useState<Brief>(() => Brief.parse({ emailType: "promo" }));
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    api<BrandData>(`/api/brands/${brandId}`)
      .then((d) => {
        setBrand(d.brand);
        setProfile(d.profile);
        setSourceCount(d.sources.length);
      })
      .catch((e) => setError(e.message));
  }, [brandId]);

  useEffect(() => {
    if (!draftId) {
      setDraft(null);
      return;
    }
    if (draft?.id === draftId) return;
    api<{ draft: Draft }>(`/api/drafts/${draftId}`)
      .then(({ draft }) => {
        setDraft(draft);
        setBrief(draft.brief);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  async function generate(rewrite: boolean) {
    setError("");
    setProgress({ phase: "Starting…", chars: 0 });
    abort.current = new AbortController();
    try {
      const d = await streamJob<Draft>(
        "/api/generate",
        { brandId, brief, draftId: rewrite ? draft?.id : undefined },
        setProgress,
        abort.current.signal,
      );
      setDraft(d);
      if (d.id !== draftId) router.replace(`/brands/${brandId}/write?draft=${d.id}`, { scroll: false });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  const briefChanged = useMemo(() => !!draft && JSON.stringify(draft.brief) !== JSON.stringify(brief), [draft, brief]);

  if (!brand) {
    return <main className="page">{error ? <div className="banner err">{error}</div> : <p className="muted">Loading…</p>}</main>;
  }

  return (
    <main className="page wide">
      <div className="crumbs">
        <Link href="/">Brands</Link> / <Link href={`/brands/${brand.id}`}>{brand.name}</Link> / Write
      </div>
      <div className="page-head">
        <div className="row">
          <h1>Write an email</h1>
          <span className="badge accent">{brand.name}</span>
          {profile ? <span className="badge">Profile v{profile.version}</span> : <span className="badge warn">No profile</span>}
        </div>
        {draft && (
          <Link className="btn" href={`/brands/${brand.id}/write`} onClick={() => setBrief(Brief.parse({ emailType: brief.emailType }))}>
            + New email
          </Link>
        )}
      </div>

      {!profile && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          {sourceCount
            ? "This brand has no voice profile yet. Emails will be based on the examples only. "
            : "This brand has no past emails or profile yet, so the voice will be generic. "}
          <Link href={`/brands/${brand.id}?tab=${sourceCount ? "profile" : "sources"}`}>Set up the voice →</Link>
        </div>
      )}

      <div className="write">
        <aside className="brief card">
          <BriefForm
            brief={brief}
            onChange={setBrief}
            disabled={!!progress || draft?.status === "final"}
            actions={
              <div className="stack tight">
                {!draft ? (
                  <button className="btn primary lg" disabled={!!progress} onClick={() => generate(false)}>
                    Write email
                  </button>
                ) : (
                  <>
                    <button
                      className="btn primary"
                      disabled={!!progress || draft.status === "final"}
                      onClick={() => generate(true)}
                      title="Rewrite the whole email from this brief. Locked blocks are kept."
                    >
                      Rewrite whole email{draft.locked.length ? " (keeps locked)" : ""}
                    </button>
                    <button className="btn" disabled={!!progress} onClick={() => generate(false)} title="Keep this draft and write a separate new one">
                      Write as a new draft
                    </button>
                    {briefChanged && <p className="small muted">The brief changed since this draft was written.</p>}
                  </>
                )}
              </div>
            }
          />
        </aside>

        <section className="stack">
          {error && <div className="banner err">{error}</div>}
          {progress && (
            <div className="card">
              <Progress progress={progress} onCancel={() => abort.current?.abort()} />
              <p className="small faint" style={{ marginTop: 8 }}>A full email usually takes 20–60 seconds.</p>
            </div>
          )}
          {!draft && !progress && (
            <div className="empty" style={{ padding: "60px 20px" }}>
              <h3>Fill in the brief and click “Write email”</h3>
              <p>You'll get 5 subject lines with preview text, a headline, body sections, CTA and design notes, all in {brand.name}'s voice.</p>
            </div>
          )}
          {draft && <DraftEditor key={draft.id + draft.revisions.length + draft.status} draft={draft} brand={brand} profile={profile} onDraft={setDraft} busy={!!progress} />}
        </section>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <WriteScreen />
    </Suspense>
  );
}
