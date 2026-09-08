import type { FolderRecord } from "./types";

// id -> 目录 的 Map（供 O(1) 回溯与判环）
export function buildFolderMap(list: FolderRecord[]): Map<string, FolderRecord> {
  const map = new Map<string, FolderRecord>();
  for (const f of list) map.set(f.id, f);
  return map;
}

// 某目录的直接子目录（parentId 为 null 时返回所有顶层目录）
export function getChildren(
  list: FolderRecord[],
  parentId: string | null
): FolderRecord[] {
  return list.filter((f) => f.parent_id === parentId);
}

// 是否叶子目录（没有任何子目录）
export function isLeaf(list: FolderRecord[], folderId: string): boolean {
  return getChildren(list, folderId).length === 0;
}

// 从根到该目录的完整路径数组（含自身），供面包屑展示；folderId 为 null 返回空数组
export function getFolderPath(
  list: FolderRecord[],
  folderId: string | null
): FolderRecord[] {
  if (!folderId) return [];
  const map = buildFolderMap(list);
  const path: FolderRecord[] = [];
  let cur = map.get(folderId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    path.unshift(cur);
    seen.add(cur.id);
    cur = cur.parent_id ? map.get(cur.parent_id) : undefined;
  }
  return path;
}

// 所有递归子孙目录 id（含自身），用于递归删除；DFS + visited 防环
export function getDescendantIds(
  list: FolderRecord[],
  folderId: string
): string[] {
  const byParent = new Map<string | null, string[]>();
  for (const f of list) {
    const k = f.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(f.id);
  }
  const result: string[] = [];
  const visited = new Set<string>();
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    result.push(id);
    for (const child of byParent.get(id) || []) stack.push(child);
  }
  return result;
}