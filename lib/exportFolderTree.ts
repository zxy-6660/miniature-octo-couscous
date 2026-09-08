import * as XLSX from "xlsx";
import type { FolderRecord } from "./types";

// 目录维度的统计信息（由调用方从 docs 汇总得到）
export interface FolderStat {
  total: number;
  unused: number;
  used: number;
}

// 生成"仅目录结构"的 Excel 并触发浏览器下载
// 依赖 xlsx（浏览器端打包），通过 JSZip 在内存中生成 .xlsx 后下载
export function exportFolderStructure(
  folders: FolderRecord[],
  stats: Map<string, FolderStat>
) {
  const byParent = new Map<string | null, FolderRecord[]>();
  for (const f of folders) {
    const key = f.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(f);
  }
  const getStat = (id: string): FolderStat =>
    stats.get(id) || { total: 0, unused: 0, used: 0 };

  const rows: unknown[][] = [
    ["层级", "目录名称", "完整路径", "子目录数", "文档总数", "未使用", "已使用"],
  ];

  const walk = (
    parentId: string | null,
    depth: number,
    pathPrefix: string[],
    visited: Set<string>
  ) => {
    const children = byParent.get(parentId) || [];
    // 为稳定呈现，按创建时间排序；同时间用名称兜底
    children.sort((a, b) => {
      const at = new Date(a.created_at).getTime();
      const bt = new Date(b.created_at).getTime();
      return at - bt || a.name.localeCompare(b.name);
    });
    for (const child of children) {
      if (visited.has(child.id)) continue; // 防环
      visited.add(child.id);
      const path = [...pathPrefix, child.name].join(" / ");
      const stat = getStat(child.id);
      const subCount = (byParent.get(child.id) || []).length;
      rows.push([
        depth,
        child.name,
        path,
        subCount,
        stat.total,
        stat.unused,
        stat.used,
      ]);
      walk(child.id, depth + 1, [...pathPrefix, child.name], visited);
    }
  };

  walk(null, 1, [], new Set<string>());

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 48 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "目录结构");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `工作台目录结构_${stamp}.xlsx`);
}