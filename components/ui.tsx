"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobProgress } from "@/lib/client";

export function Progress({ progress, onCancel }: { progress: JobProgress; onCancel?: () => void }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="progress">
      <div className="row between">
        <span>{progress.phase}</span>
        <span className="row small faint">
          {secs}s
          {onCancel && (
            <button className="btn ghost sm" onClick={onCancel}>
              Cancel
            </button>
          )}
        </span>
      </div>
      <div className="bar" />
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  const node = msg ? <div className="toast">{msg}</div> : null;
  return { show, node };
}

/** Textarea that grows with its content. */
export function AutoText(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const { minRows = 2, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={minRows} {...rest} style={{ resize: "none", overflow: "hidden", ...rest.style }} />;
}

export function Counter({ text, max, min }: { text: string; max: number; min?: number }) {
  const n = [...text].length;
  const bad = n > max || (min !== undefined && n < min);
  return <span className={`counter ${bad ? "over" : ""}`}>{n}/{max}</span>;
}
