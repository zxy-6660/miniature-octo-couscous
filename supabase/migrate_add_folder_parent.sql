-- =============================================================
-- 工作台 - 迁移：folders 支持无限层嵌套（目录套目录）
-- 使用方法：Supabase Dashboard -> SQL Editor -> New query -> Run
-- 可重复执行（幂等）。
-- 说明：新增 parent_id 自引用列；现有顶层目录 parent_id 保持 null；
--       文档仍只挂叶子目录的 folder_id，documents 无需改动。
-- =============================================================

-- 1. 新增父目录自引用列（顶层为 null；已有目录自动保持为 null）
alter table public.folders
  add column if not exists parent_id uuid references public.folders(id);

-- 2. 将顶层目录显式保持为 null（幂等：不展平已嵌套数据）
update public.folders set parent_id = null where parent_id is null;

-- 3. 子目录按父目录查询的索引
create index if not exists folders_parent_idx
  on public.folders (parent_id);

-- 4. 名称唯一性由「全局唯一」改为「同一父目录下唯一」
--    （顶层以哨牙齿作为父键，允许不同父目录下同名子目录）
alter table public.folders
  drop constraint if exists folders_name_key;
create unique index if not exists folders_parent_name_idx
  on public.folders (coalesce(parent_id,
    '00000000-0000-0000-0000-000000000000'::uuid), name);

-- 5. RLS 无需改动：folders 现有策略均为 anon using(true) / with check(true)，
--    对整行生效、不针对特定列，新增 parent_id 不改变可见性/可写性。