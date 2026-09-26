"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DocsTab } from "@/components/brand/DocsTab";
import { ProfileTab } from "@/components/brand/ProfileTab";
import { RulesTab } from "@/components/brand/RulesTab";
import { SourcesTab } from "@/components/brand/SourcesTab";
import { api } from "@/lib/client";
import type { BrandData } from "@/components/brand/types";

type Tab = "sources" | "docs" | "profile" | "rules";

function BrandSetup() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const [data, setData] = useState<BrandData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>((search.get("tab") as Tab) || "sources");

  const reload = useCallback(async () => {
    try {
      setData(await api<BrandData>(`/api/brands/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  function switchTab(t: Tab) {
    setTab(t);
    router.replace(`/brands/${id}?tab=${t}`, { scroll: false });
  }

  if (error) return <main className="page"><div className="banner err">{error}</div></main>;
  if (!data) return <main className="page"><p className="muted">Loading…</p></main>;

  const { brand, sources, docs, profile } = data;

  return (
    <main className="page">
      <div className="crumbs">
        <Link href="/">Brands</Link> / {brand.name}
      </div>
      <div className="page-head">
        <div>
          <h1>{brand.name}</h1>
          <p className="sub">{brand.description || "Set up this brand's voice, then write emails in it."}</p>
        </div>
        <Link className="btn primary" href={`/brands/${brand.id}/write`}>
          Write an email
        </Link>
      </div>

      <div className="tabs">
        <button className={tab === "sources" ? "active" : ""} onClick={() => switchTab("sources")}>
          1. Past emails<span className="count">{sources.length}</span>
        </button>
        <button className={tab === "docs" ? "active" : ""} onClick={() => switchTab("docs")}>
          2. Brand documents<span className="count">{docs.length}</span>
        </button>
        <button className={tab === "profile" ? "active" : ""} onClick={() => switchTab("profile")}>
          3. Voice profile{profile && <span className="count">v{profile.version}</span>}
        </button>
        <button className={tab === "rules" ? "active" : ""} onClick={() => switchTab("rules")}>
          4. Rules & palette
        </button>
      </div>

      {tab === "sources" && <SourcesTab data={data} reload={reload} goToProfile={() => switchTab("profile")} />}
      {tab === "docs" && <DocsTab data={data} reload={reload} goToProfile={() => switchTab("profile")} />}
      {tab === "profile" && <ProfileTab data={data} reload={reload} />}
      {tab === "rules" && <RulesTab brand={brand} onSaved={reload} />}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <BrandSetup />
    </Suspense>
  );
}
