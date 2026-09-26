"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export function Nav() {
  const path = usePathname();
  const [keyMissing, setKeyMissing] = useState(false);

  useEffect(() => {
    api<{ apiKeySet: boolean }>("/api/settings")
      .then((s) => setKeyMissing(!s.apiKeySet))
      .catch(() => {});
  }, [path]);

  const link = (href: string, label: string) => {
    const active = href === "/" ? path === "/" || path.startsWith("/brands") : path.startsWith(href);
    return (
      <Link href={href} className={active ? "active" : ""}>
        {label}
      </Link>
    );
  };

  return (
    <>
      <header className="topbar">
        <Link href="/" className="logo">
          <span>✉</span> Brand Copywriter
        </Link>
        <nav>
          {link("/", "Brands")}
          {link("/history", "History")}
          {link("/settings", "Settings")}
        </nav>
      </header>
      {keyMissing && path !== "/settings" && (
        <div className="banner warn" style={{ borderRadius: 0 }}>
          No Claude API key yet. <Link href="/settings">Add it in Settings</Link> to start writing.
        </div>
      )}
    </>
  );
}
