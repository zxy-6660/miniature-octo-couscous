"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DocRecord, FolderRecord } from "@/lib/types";
import UploadZone from "./UploadZone";
import DocumentReader from "./DocumentReader";
import MarkUsedModal from "./MarkUsedModal";
import {
  getChildren,
  getDescendantIds,
  getFolderPath,
} from "@/lib/tree";

export default function Workbench() {
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [reading, setReading] = useState<DocRecord | null>(null);
  const [marking, setMarking] = useState<DocRecord | null>(null);
  // 当前进入的目录 id，null 表示停留在目录列表页
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  // 当前进入的月份（YYYY-MM），null 表示停留在目录内月份列表页
  const [activeDate, setActiveDate] = useState<string | null>(null);
  // 新建目录时的名称输入
  const [newFolderName, setNewFolderName] = useState("");
  // 新建目录按钮是否正在提交（用于 loading 反馈）
  const [creatingFolder, setCreatingFolder] = useState(false);
  // 待确认删除的目录（非 null 时显示删除确认弹窗）
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderRecord | null>(null);
  // 删除确认弹窗里的删除是否进行中
  const [deletingFolder, setDeletingFolder] = useState(false);
  // 新建月份时选择的月份，默认当月
  const [newDate, setNewDate] = useState(
    new Date().toISOString().slice(0, 7)
  );
  // 目录搜索：输入值 与 点击后生效的关键词（点按钮才触发过滤）
  const [folderSearchInput, setFolderSearchInput] = useState("");
  const [folderSearchQuery, setFolderSearchQuery] = useState("");

  const loadDocs = useCallback(async () => {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("category_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    setDocs((data as DocRecord[]) || []);
  }, []);

  const loadFolders = useCallback(async () => {
    const { data, error } = await supabase
      .from("folders")
      .select("id, name, parent_id, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    setFolders((data as FolderRecord[]) || []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadFolders(), loadDocs()]);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "加载数据失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadFolders, loadDocs]);

  // 当前目录对象（用于展示名称、删除）
  const activeFolder = useMemo(
    () => folders.find((f) => f.id === activeFolderId) || null,
    [folders, activeFolderId]
  );

  // 顶层目录列表
  const topFolders = useMemo(
    () => getChildren(folders, null),
    [folders]
  );

  // 当前目录的直接子目录
  const subFolders = useMemo(
    () => (activeFolderId ? getChildren(folders, activeFolderId) : []),
    [folders, activeFolderId]
  );

  // 从根到当前目录的完整路径（面包屑）
  const folderPath = useMemo(
    () => getFolderPath(folders, activeFolderId),
    [folders, activeFolderId]
  );

  // 每个目录的直接子目录数（用于列表副文案）
  const childCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of folders) {
      if (f.parent_id) map.set(f.parent_id, (map.get(f.parent_id) || 0) + 1);
    }
    return map;
  }, [folders]);

  // 触发一次搜索（点按钮/回车时调用）：
  // 空关键词则清空搜索；否则把当前输入值设为生效关键词
  const applyFolderSearch = useCallback(() => {
    const q = folderSearchInput.trim();
    if (!q) {
      setFolderSearchQuery("");
      return;
    }
    setFolderSearchQuery(q);
  }, [folderSearchInput]);

  // 根据生效关键词过滤目录列表
  const filterFolders = useCallback(
    (list: FolderRecord[]) => {
      if (!folderSearchQuery) return list;
      const q = folderSearchQuery.toLowerCase();
      return list.filter((f) => f.name.toLowerCase().includes(q));
    },
    [folderSearchQuery]
  );

  // 搜索后的顶层目录列表
  const shownTopFolders = useMemo(
    () => filterFolders(topFolders),
    [topFolders, filterFolders]
  );

  // 搜索后的子目录列表
  const shownSubFolders = useMemo(
    () => filterFolders(subFolders),
    [subFolders, filterFolders]
  );

  // 只有当进入某个月份目录后才能上传，上传归入该目录该月份
  const handleUpload = async (files: File[]) => {
    const targetFolderId = activeFolderId;
    const targetDate = activeDate;
    if (!targetFolderId || !targetDate) {
      setUploadError("请先进入对应的目录和月份，再上传文档。");
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
          folder_id: targetFolderId,
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

  const handleCreateFolder = async (parentId: string | null) => {
    const name = newFolderName.trim();
    if (!name) {
      setUploadError("请输入目录名称。");
      return;
    }
    if (creatingFolder) return; // 防止连点重复提交
    setUploadError("");
    setCreatingFolder(true);
    try {
      // 插入并拿回新行，便于本地即时追加，不等整表刷新
      const { data, error } = await supabase
        .from("folders")
        .insert({ name, parent_id: parentId })
        .select("id, name, parent_id, created_at")
        .single();
      if (error) throw error;
      setFolders((prev) =>
        prev.some((f) => f.id === data.id) ? prev : [...prev, data]
      );
      setNewFolderName("");
      // 保持在当前视图，不自动进入新创建的目录
      setActiveDate(null);
      // 后台静默兜底校准，不阻塞 UI
      loadFolders().catch(() => {
        /* 后台刷新失败不影响已插入的本地目录 */
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "创建目录失败");
    } finally {
      setCreatingFolder(false);
    }
  };

  // 点击「删除目录」：打开自定义确认弹窗，不弹原生 confirm
  const handleDeleteFolder = (folder: FolderRecord) => {
    setDeleteFolderTarget(folder);
  };

  // 弹窗内点击「确认删除」：真正执行删除
  const confirmDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    const folder = deleteFolderTarget; // 闭包取当前目标
    setDeletingFolder(true);
    // 递归收集该目录及其所有子孙目录
    const ids = getDescendantIds(folders, folder.id);
    const folderIds = new Set(ids);
    const deletedDocs = docs.filter((d) => folderIds.has(d.folder_id));
    try {
      if (deletedDocs.length > 0) {
        await supabase.storage
          .from("documents")
          .remove(deletedDocs.map((d) => d.file_path));
        await supabase
          .from("documents")
          .delete()
          .in("folder_id", ids);
      }
      const { error } = await supabase
        .from("folders")
        .delete()
        .in("id", ids);
      if (error) throw error;
      if (activeFolderId && ids.includes(activeFolderId)) {
        setActiveDate(null);
        setActiveFolderId(folder.parent_id ?? null);
      }
      setDeleteFolderTarget(null);
      await Promise.all([loadFolders(), loadDocs()]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "删除目录失败");
    } finally {
      setDeletingFolder(false);
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

  // 统计每个目录的信息
  const folderStats = useMemo(() => {
    const map = new Map<
      string,
      { total: number; unused: number; used: number; months: Set<string> }
    >();
    for (const d of docs) {
      const cur = map.get(d.folder_id) || {
        total: 0,
        unused: 0,
        used: 0,
        months: new Set<string>(),
      };
      cur.total += 1;
      if (d.status === "已使用") cur.used += 1;
      else cur.unused += 1;
      cur.months.add(d.category_date);
      map.set(d.folder_id, cur);
    }
    return map;
  }, [docs]);

  // 当前目录下的月份分组
  const folderMonths = useMemo(() => {
    const list = docs.filter((d) => d.folder_id === activeFolderId);
    const map = new Map<string, { total: number; unused: number; used: number }>();
    for (const d of list) {
      const cur = map.get(d.category_date) || { total: 0, unused: 0, used: 0 };
      cur.total += 1;
      if (d.status === "已使用") cur.used += 1;
      else cur.unused += 1;
      map.set(d.category_date, cur);
    }
    return Array.from(map.entries()).sort((a, b) =>
      b[0].localeCompare(a[0])
    );
  }, [docs, activeFolderId]);

  // 当前目录某月份下的文档
  const activeDocs = useMemo(
    () =>
      docs.filter(
        (d) => d.folder_id === activeFolderId && d.category_date === activeDate
      ),
    [docs, activeFolderId, activeDate]
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
          管理你的文档：目录可嵌套多级，仅在叶子目录按月份归档，可在线阅读并标记使用状态。
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

      {/* ============ 视图零：目录列表页 ============ */}
      {!activeFolderId ? (
        <main>
          {/* 新建目录 */}
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
            <div>
              <p className="text-sm font-medium text-zinc-700">新建目录</p>
              <p className="text-xs text-zinc-500">
                输入目录名称，创建后进入该目录即可按月归档文档
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder(null);
                }}
                placeholder="请输入目录名称！"
                className="w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={() => handleCreateFolder(null)}
                disabled={creatingFolder}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingFolder ? "创建中…" : "创建并进入"}
              </button>
            </div>
          </div>

          {/* 搜索当前层目录 */}
          {topFolders.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <input
                type="text"
                value={folderSearchInput}
                onChange={(e) => setFolderSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFolderSearch();
                }}
                placeholder="搜索当前层目录名称…"
                className="w-64 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={applyFolderSearch}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900"
              >
                搜索
              </button>
              {folderSearchQuery && (
                <button
                  onClick={() => {
                    setFolderSearchInput("");
                    setFolderSearchQuery("");
                  }}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
                >
                  清除
                </button>
              )}
            </div>
          )}

          <h2 className="mb-3 text-sm font-semibold text-zinc-500">目录列表</h2>

          {loading ? (
            <p className="py-10 text-center text-sm text-zinc-500">加载中…</p>
          ) : folderSearchQuery && shownTopFolders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-12 text-center">
              <p className="text-sm text-zinc-500">
                没有找到包含「{folderSearchQuery}」的目录
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                请更换关键词，或点「清除」查看全部目录。
              </p>
            </div>
          ) : shownTopFolders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-12 text-center">
              <p className="text-sm text-zinc-500">还没有任何目录</p>
              <p className="mt-1 text-xs text-zinc-400">
                在上方输入名称并点击「创建并进入」，即可新建第一个目录。
                <br />
                目录可再嵌套子目录，仅叶子目录可建月份、上传文档。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shownTopFolders.map((folder) => {
                const stat = folderStats.get(folder.id) || {
                  total: 0,
                  unused: 0,
                  used: 0,
                  months: new Set<string>(),
                };
                const childCount = childCountMap.get(folder.id) || 0;
                return (
                  <div
                    key={folder.id}
                    className="group flex flex-col items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-left transition-colors hover:border-blue-400 hover:shadow-sm"
                  >
                    <button
                      onClick={() => {
                        setActiveDate(null);
                        setActiveFolderId(folder.id);
                      }}
                      className="flex flex-col items-start gap-3 text-left"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-xl group-hover:bg-blue-200">
                        📁
                      </span>
                      <div>
                        <p className="text-base font-semibold text-zinc-800">
                          {folder.name}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {childCount > 0
                            ? `含 ${childCount} 个子目录 · 共 ${stat.total} 篇`
                            : `叶子目录 · 共 ${stat.total} 篇 · 未使用 ${stat.unused} · 已使用 ${stat.used}`}
                        </p>
                      </div>
                      <span className="mt-1 rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                        {childCount > 0 ? "进入查看子目录 →" : "进入 →"}
                      </span>
                    </button>
                    <button
                      onClick={() => handleDeleteFolder(folder)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 hover:text-red-500"
                      title="删除目录（含其所有子目录）"
                    >
                      删除目录
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      ) : activeFolder && !activeDate ? (
        /* ============ 视图一：目录内（子目录列表 或 月份列表） ============ */
        <main>
          {/* 面包屑 */}
          <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
            <button
              onClick={() => {
                setActiveDate(null);
                setActiveFolderId(null);
              }}
              className="rounded-lg px-2 py-1 font-medium text-zinc-500 hover:bg-zinc-100"
            >
              ← 根目录
            </button>
            {folderPath.map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <span className="text-zinc-300">/</span>
                <button
                  onClick={() => {
                    setActiveDate(null);
                    setActiveFolderId(f.id);
                  }}
                  className={`rounded-lg px-2 py-1 font-medium hover:bg-zinc-100 ${
                    f.id === activeFolderId
                      ? "text-zinc-800"
                      : "text-zinc-500"
                  }`}
                >
                  {f.name}
                </button>
              </span>
            ))}
            <span className="ml-2 text-xs text-zinc-400">
              {subFolders.length > 0
                ? `${subFolders.length} 个子目录`
                : "叶子目录"}
            </span>
          </div>

          {subFolders.length > 0 ? (
            /* ---- 非叶子：显示子目录列表 + 新建子目录 ---- */
            <>
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <div>
                  <p className="text-sm font-medium text-zinc-700">新建子目录</p>
                  <p className="text-xs text-zinc-500">
                    在该目录下新建一个子目录，子目录可继续嵌套
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        handleCreateFolder(activeFolderId);
                    }}
                    placeholder="子目录名称，例如：项目B"
                    className="w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    onClick={() => handleCreateFolder(activeFolderId)}
                    disabled={creatingFolder}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingFolder ? "创建中…" : "创建"}
                  </button>
                </div>
              </div>

              {/* 搜索当前层子目录 */}
              {subFolders.length > 0 && (
                <div className="mb-4 flex items-center gap-2">
                  <input
                    type="text"
                    value={folderSearchInput}
                    onChange={(e) => setFolderSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyFolderSearch();
                    }}
                    placeholder={`搜索「${activeFolder.name}」下子目录…`}
                    className="w-64 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    onClick={applyFolderSearch}
                    className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900"
                  >
                    搜索
                  </button>
                  {folderSearchQuery && (
                    <button
                      onClick={() => {
                        setFolderSearchInput("");
                        setFolderSearchQuery("");
                      }}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
                    >
                      清除
                    </button>
                  )}
                </div>
              )}

              <h2 className="mb-3 text-sm font-semibold text-zinc-500">
                「{activeFolder.name}」的子目录
              </h2>
              {folderSearchQuery && shownSubFolders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-12 text-center">
                  <p className="text-sm text-zinc-500">
                    没有找到包含「{folderSearchQuery}」的子目录
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    请更换关键词，或点「清除」查看全部子目录。
                  </p>
                </div>
              ) : shownSubFolders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-12 text-center">
                  <p className="text-sm text-zinc-500">暂无子目录</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shownSubFolders.map((sf) => {
                    const sc = childCountMap.get(sf.id) || 0;
                    return (
                      <div
                        key={sf.id}
                        className="group flex flex-col items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-left transition-colors hover:border-blue-400 hover:shadow-sm"
                      >
                        <button
                          onClick={() => {
                            setActiveDate(null);
                            setActiveFolderId(sf.id);
                          }}
                          className="flex flex-col items-start gap-3 text-left"
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-xl group-hover:bg-blue-200">
                            📁
                          </span>
                          <div>
                            <p className="text-base font-semibold text-zinc-800">
                              {sf.name}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {sc > 0
                                ? `含 ${sc} 个子目录`
                                : "叶子目录，可建月份上传文档"}
                            </p>
                          </div>
                          <span className="mt-1 rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                            {sc > 0 ? "进入查看子目录 →" : "进入 →"}
                          </span>
                        </button>
                        <button
                          onClick={() => handleDeleteFolder(sf)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 hover:text-red-500"
                          title="删除（含其所有子目录与文档）"
                        >
                          删除目录
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* ---- 叶子：显示月份列表 + 新建月份 + 新建子目录 ---- */
            <>
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <div>
                  <p className="text-sm font-medium text-zinc-700">新建月份并进入</p>
                  <p className="text-xs text-zinc-500">
                    叶子目录下选择月份进入，即可上传文档（按该月份归档）
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

              {/* 新建子目录（叶子也可拆分为容器） */}
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-4">
                <div>
                  <p className="text-sm font-medium text-zinc-700">再建子目录</p>
                  <p className="text-xs text-zinc-500">
                    将「{activeFolder.name}」变成容器目录（新建后其上月份不再直接显示）
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (folderMonths.length > 0) {
                          if (
                            !window.confirm(
                              "该目录已有月份/文档，新建子目录后这些月份将不再显示。仍要继续吗？"
                            )
                          )
                            return;
                        }
                        handleCreateFolder(activeFolderId);
                      }
                    }}
                    placeholder="子目录名称"
                    className="w-44 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    onClick={() => {
                      if (folderMonths.length > 0) {
                        if (
                          !window.confirm(
                            "该目录已有月份/文档，新建子目录后这些月份将不再显示。仍要继续吗？"
                          )
                        )
                          return;
                      }
                      handleCreateFolder(activeFolderId);
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    创建子目录
                  </button>
                </div>
              </div>

              <h2 className="mb-3 text-sm font-semibold text-zinc-500">
                「{activeFolder.name}」的月份目录
              </h2>

              {folderMonths.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-12 text-center">
                  <p className="text-sm text-zinc-500">该目录还没有任何月份</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    选择上方月份并点击「进入」，即可在该月份下上传第一个文档。
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {folderMonths.map(([date, stat]) => (
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
            </>
          )}
        </main>
      ) : activeFolder && activeDate ? (
        /* ============ 视图二：月份文档页（可上传） ============ */
        <main>
          {/* 完整面包屑 */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <button
                onClick={() => {
                  setActiveDate(null);
                  setActiveFolderId(null);
                }}
                className="rounded-lg px-2 py-1 font-medium text-zinc-500 hover:bg-zinc-100"
              >
                ← 根目录
              </button>
              {folderPath.map((f) => (
                <span key={f.id} className="flex items-center gap-1">
                  <span className="text-zinc-300">/</span>
                  <button
                    onClick={() => {
                      setActiveDate(null);
                      setActiveFolderId(f.id);
                    }}
                    className="rounded-lg px-2 py-1 font-medium text-zinc-500 hover:bg-zinc-100"
                  >
                    {f.name}
                  </button>
                </span>
              ))}
              <span className="text-zinc-300">/</span>
              <span className="rounded-lg px-2 py-1 text-zinc-700">
                {formatDate(activeDate)}
              </span>
            </div>
            <span className="text-xs text-zinc-500">
              {activeDocs.length} 篇
            </span>
          </div>

          {/* 当前月才可上传 */}
          <UploadZone onUpload={handleUpload} uploading={uploading} />

          {/* 当前月份的文档列表 */}
          <div className="mt-6 space-y-2">
            {activeDocs.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-10 text-center text-sm text-zinc-400">
                「{activeFolder.name} / {formatDate(activeDate)}」为空，请在上方上传你的第一个文档。
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
      ) : (
        /* 兜底：目录不存在（可能已被删除） */
        <main>
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-12 text-center">
            <p className="text-sm text-zinc-500">目录不存在或已被删除</p>
            <button
              onClick={() => {
                setActiveDate(null);
                setActiveFolderId(null);
              }}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              返回目录列表
            </button>
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
      {deleteFolderTarget &&
        (() => {
          const ids = getDescendantIds(folders, deleteFolderTarget.id);
          const folderIds = new Set(ids);
          const docCount = docs.filter((d) =>
            folderIds.has(d.folder_id)
          ).length;
          const subCount = ids.length - 1;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-zinc-900">
                  删除目录
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                  确定要删除目录「
                  <b className="text-zinc-900">{deleteFolderTarget.name}</b>」
                  吗？将同时删除{" "}
                  <b className="text-zinc-900">{subCount}</b> 个子目录、
                  <b className="text-zinc-900">{docCount}</b>{" "}
                  篇文档及文件，此操作<b className="text-red-600">不可恢复</b>。
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    onClick={() => setDeleteFolderTarget(null)}
                    disabled={deletingFolder}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-60"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmDeleteFolder}
                    disabled={deletingFolder}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingFolder ? "删除中…" : "确认删除"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}