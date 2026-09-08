"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DocRecord } from "@/lib/types";
import UploadZone from "./UploadZone";
import DocumentReader from "./DocumentReader";
import MarkUsedModal from "./MarkUsedModal";

export default function Workbench() {
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [reading, setReading] = useState<DocRecord | null>(null);
  const [marking, setMarking] = useState<DocRecord | null>(null);
  // 当前进入的月份目录（YYYY-MM），null 表示停留在目录列表页
  const [activeDate, setActiveDate] = useState<string | null>(null);
  // “新建目录”时选择的月份，默认当月
  const [newDate, setNewDate] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const loadDocs = useCallback(async () => {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("category_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    setDocs((data as DocRecord[]) || []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadDocs();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "加载文档失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadDocs]);

  // 只有当进入某个月份目录后才能上传，上传归入该目录月份
  const handleUpload = async (files: File[]) => {
    const targetDate = activeDate;
    if (!targetDate) {
      setUploadError("请先进入对应月份的目录，再上传文档。");
      return;
    }
    setUploading(true);
    setUploadError("");
    const savedPaths: string[] = [];
    try {
      for (const file of files) {
        const title = file.name.replace(/\.(docx|doc)$/i, "");
        // 存储路径只使用安全的 ASCII 字符（时间戳+随机值+扩展名），
        // 不包含中文，避免 Supabase Storage 对含非 ASCII 路径报 "Invalid key"。
        const ext = (file.name.match(/\.(docx|doc)$/i) || [".docx"])[0];
        const path = `docs/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}${ext.toLowerCase()}`;

        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
          });
        if (upErr) throw upErr;
        savedPaths.push(path);

        const { error: dbErr } = await supabase.from("documents").insert({
          title,
          client_file_name: file.name,
          file_path: path,
          category_date: targetDate,
          file_size: file.size,
          status: "未使用",
        });
        if (dbErr) throw dbErr;
      }
      await loadDocs();
    } catch (e) {
      // 清理已上传但未入库的对象
      for (const p of savedPaths) {
        await supabase.storage.from("documents").remove([p]);
      }
      setUploadError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: DocRecord) => {
    const ok = window.confirm(`确定删除「${doc.title}」及其文件吗？`);
    if (!ok) return;
    try {
      await supabase.storage.from("documents").remove([doc.file_path]);
      await supabase.from("documents").delete().eq("id", doc.id);
      await loadDocs();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleMarkUsed = async (
    doc: DocRecord,
    remark: string
  ): Promise<void> => {
    const { error } = await supabase
      .from("documents")
      .update({
        status: "已使用",
        remark,
        used_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    if (error) throw error;
    await loadDocs();
    setMarking(null);
  };

  const handleRevert = async (doc: DocRecord) => {
    const { error } = await supabase
      .from("documents")
      .update({ status: "未使用", remark: null, used_at: null })
      .eq("id", doc.id);
    if (error) {
      setUploadError(error.message);
      return;
    }
    await loadDocs();
  };

  // 统计每个月份的目录信息
  const folders = useMemo(() => {
    const map = new Map<string, { total: number; unused: number; used: number }>();
    for (const d of docs) {
      const cur = map.get(d.category_date) || {
        total: 0,
        unused: 0,
        used: 0,
      };
      cur.total += 1;
      if (d.status === "已使用") cur.used += 1;
      else cur.unused += 1;
      map.set(d.category_date, cur);
    }
    return Array.from(map.entries()).sort((a, b) =>
      b[0].localeCompare(a[0])
    );
  }, [docs]);

  // 当前目录下的文档
  const activeDocs = useMemo(
    () => docs.filter((d) => d.category_date === activeDate),
    [docs, activeDate]
  );

  const totalUnused = useMemo(
    () => docs.filter((d) => d.status === "未使用").length,
    [docs]
  );
  const usedCount = docs.length - totalUnused;

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 KB";
    const mb = bytes / 1024 / 1024;
    return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };
  const formatDate = (d: string) => {
    const [y, m] = d.split("-");
    return `${y}年${Number(m)}月`;
  };

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      {/* 头部（始终显示） */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">📚 工作台</h1>
        <p className="mt-1 text-sm text-zinc-500">
          管理你的文档，按月份归档，可在线阅读并标记使用状态。
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">
            全部 <b className="font-semibold">{docs.length}</b>
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
            未使用 <b className="font-semibold">{totalUnused}</b>
          </span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
            已使用 <b className="font-semibold">{usedCount}</b>
          </span>
        </div>
      </header>

      {uploadError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          ⚠️ {uploadError}
        </p>
      )}

      {/* ============ 视图一：月份目录列表页 ============ */}
      {!activeDate ? (
        <main>
          {/* 新建月份目录 */}
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
            <div>
              <p className="text-sm font-medium text-zinc-700">
                新建月份目录并进入
              </p>
              <p className="text-xs text-zinc-500">
                选择月份后进入该目录即可上传文档（文档将归档到该月份）
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="month"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={() => setActiveDate(newDate)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                进入
              </button>
            </div>
          </div>

          <h2 className="mb-3 text-sm font-semibold text-zinc-500">
            月份目录
          </h2>

          {loading ? (
            <p className="py-10 text-center text-sm text-zinc-500">加载中…</p>
          ) : folders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-12 text-center">
              <p className="text-sm text-zinc-500">还没有任何月份目录</p>
              <p className="mt-1 text-xs text-zinc-400">
                选择上方月份并点击「进入」，即可在该目录下上传第一个文档。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {folders.map(([date, stat]) => (
                <button
                  key={date}
                  onClick={() => setActiveDate(date)}
                  className="group flex flex-col items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-left transition-colors hover:border-blue-400 hover:shadow-sm"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-xl group-hover:bg-blue-200">
                    🗂️
                  </span>
                  <div>
                    <p className="text-base font-semibold text-zinc-800">
                      {formatDate(date)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      共 {stat.total} 篇 · 未使用 {stat.unused} · 已使用{" "}
                      {stat.used}
                    </p>
                  </div>
                  <span className="mt-1 rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                    进入 → 上传
                  </span>
                </button>
              ))}
            </div>
          )}
        </main>
      ) : (
        /* ============ 视图二：目录详情页（可上传） ============ */
        <main>
          {/* 面包屑 / 返回 */}
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => setActiveDate(null)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
            >
              ← 返回月份目录
            </button>
            <h2 className="text-lg font-semibold text-zinc-800">
              📁 {formatDate(activeDate)}
            </h2>
            <span className="text-xs text-zinc-500">
              {activeDocs.length} 篇
            </span>
          </div>

          {/* 当前目录下才能上传 */}
          <UploadZone onUpload={handleUpload} uploading={uploading} />

          {/* 当前目录的文档列表 */}
          <div className="mt-6 space-y-2">
            {activeDocs.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-10 text-center text-sm text-zinc-400">
                该目录为空，请在上方上传你的第一个文档。
              </p>
            ) : (
              activeDocs.map((doc) => {
                const used = doc.status === "已使用";
                return (
                  <div
                    key={doc.id}
                    className={`flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center ${
                      used
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-zinc-200"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <button
                        onClick={() => setReading(doc)}
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-lg hover:bg-blue-200"
                        title="在线阅读"
                      >
                        📄
                      </button>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setReading(doc)}
                            className="truncate text-left font-medium text-zinc-800 hover:text-blue-600"
                            title={doc.client_file_name}
                          >
                            {doc.title}
                          </button>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              used
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {doc.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">
                          {doc.client_file_name} · {formatSize(doc.file_size)}
                        </p>
                        {used && doc.remark && (
                          <p className="mt-1 rounded bg-amber-100/70 px-2 py-1 text-xs text-zinc-600">
                            📌 {doc.remark}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setReading(doc)}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                        >
                          阅读
                        </button>
                        {!used ? (
                          <button
                            onClick={() => setMarking(doc)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                          >
                            标记已使用
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRevert(doc)}
                            className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                          >
                            撤销
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(doc)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-400 hover:text-red-500"
                          title="删除"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
      )}

      {reading && (
        <DocumentReader doc={reading} onClose={() => setReading(null)} />
      )}
      {marking && (
        <MarkUsedModal
          docTitle={marking.title}
          initialRemark={marking.remark}
          onClose={() => setMarking(null)}
          onConfirm={(remark) =>
            marking ? handleMarkUsed(marking, remark) : Promise.resolve()
          }
        />
      )}
    </div>
  );
}