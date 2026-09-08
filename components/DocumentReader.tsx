"use client";

import { useEffect, useState } from "react";
import mammoth from "mammoth/mammoth.browser";
import { supabase } from "@/lib/supabase";
import type { DocRecord } from "@/lib/types";

interface DocumentReaderProps {
  doc: DocRecord;
  onClose: () => void;
}

type LoadState = "loading" | "ready" | "error";

export default function DocumentReader({ doc, onClose }: DocumentReaderProps) {
  const [state, setState] = useState<LoadState>("loading");
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState("loading");
      setError("");
      try {
        const { data, error } = await supabase.storage
          .from("documents")
          .download(doc.file_path);
        if (error || !data) throw error || new Error("文件下载失败");
        const buffer = await data.arrayBuffer();
        const result = await mammoth.convertToHtml(
          { arrayBuffer: buffer },
          { styleMap: [] }
        );
        if (cancelled) return;
        setHtml(result.value);
        setState("ready");
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "读取文档失败");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.file_path, doc.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-zinc-800">
              {doc.title}
            </h2>
            <p className="text-xs text-zinc-500">
              {doc.client_file_name} · {doc.category_date}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
          >
            关闭 ✕
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto bg-zinc-100">
          {state === "loading" && (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              <span className="animate-pulse">正在解析文档…</span>
            </div>
          )}
          {state === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-sm text-red-500">无法读取该文档</p>
              <p className="max-w-md text-xs text-zinc-500">{error}</p>
            </div>
          )}
          {state === "ready" && (
            <div
              className="mx-auto my-4 min-h-full max-w-3xl rounded-lg bg-white px-8 py-10 shadow-sm doc-viewer"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  );
}