"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fmtDate, fmtUsd } from "@/lib/client";
import { EMAIL_TYPE_LABELS, type EmailType } from "@/lib/types";

interface Row {
  id: string;
  brandId: string;
  brandName: string;
  emailType: EmailType;
  goal: string;
  subject: string;
  headline: string;
  status: "draft" | "final";
  costUsd: number;
  updatedAt: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [brand, setBrand] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Row[]>("/api/drafts").then(setRows).catch((e) => setError(e.message));
  }, []);

  const brands = [...new Map((rows ?? []).map((r) => [r.brandId, r.brandName])).entries()];
  const shown = (rows ?? []).filter(
    (r) =>
      (brand === "all" || r.brandId === brand) &&
      (status === "all" || r.status === status) &&
      (!q || `${r.subject} ${r.headline} ${r.goal}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>History</h1>
          <p className="sub">Every email written here, newest first.</p>
        </div>
        <div className="row">
          <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
          <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: 170 }}>
            <option value="all">All brands</option>
            {brands.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 130 }}>
            <option value="all">Any status</option>
            <option value="draft">Drafts</option>
            <option value="final">Final</option>
          </select>
        </div>
      </div>
      {error && <div className="banner err">{error}</div>}
      {rows === null && !error && <p className="muted">Loading…</p>}
      {rows?.length === 0 && <div className="empty">Nothing written yet.</div>}
      {shown.length > 0 && (
        <table className="list">
          <thead>
            <tr>
              <th>Subject / headline</th>
              <th>Brand</th>
              <th>Type</th>
              <th>Status</th>
              <th>Cost</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => router.push(`/brands/${r.brandId}/write?draft=${r.id}`)}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.subject || "(no subject)"}</div>
                  <div className="small muted">{r.headline}</div>
                </td>
                <td className="nowrap">{r.brandName}</td>
                <td className="nowrap">{EMAIL_TYPE_LABELS[r.emailType]}</td>
                <td>{r.status === "final" ? <span className="badge ok">Final</span> : <span className="badge">Draft</span>}</td>
                <td className="small muted">{fmtUsd(r.costUsd)}</td>
                <td className="small muted nowrap">{fmtDate(r.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
