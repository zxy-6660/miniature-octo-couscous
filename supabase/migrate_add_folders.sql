-- =============================================================
-- 迁移：新增 folders 表，documents 增加 folder_id
--       历史文档统一归档到「默认」目录
-- 使用方法：Supabase Dashboard -> SQL Editor -> New query -> Run
-- 可重复执行（幂等）。
-- =============================================================

-- 1. 创建目录表 folders（需在 documents 引用之前）
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 2. documents 增加 folder_id，仅首次生效
alter table public.documents
  add column if not exists folder_id uuid references public.folders(id);

-- 3. 确保「默认」目录存在（幂等：name 唯一冲突则不插入）
insert into public.folders (name)
values ('默认')
on conflict (name) do nothing;

-- 4. 把现有所有文档回填到「默认」目录
update public.documents
set folder_id = (select id from public.folders where name = '默认')
where folder_id is null;

-- 5. 回填完成后收紧为 not null（必须在第 4 步之后执行）
alter table public.documents
  alter column folder_id set not null;

-- 6. folders 的宽松 anon 策略（与 documents 保持一致）
alter table public.folders enable row level security;

drop policy if exists "anon_folders_select" on public.folders;
create policy "anon_folders_select"
  on public.folders for select
  to anon using (true);

drop policy if exists "anon_folders_insert" on public.folders;
create policy "anon_folders_insert"
  on public.folders for insert
  to anon with check (true);

drop policy if exists "anon_folders_update" on public.folders;
create policy "anon_folders_update"
  on public.folders for update
  to anon using (true) with check (true);

drop policy if exists "anon_folders_delete" on public.folders;
create policy "anon_folders_delete"
  on public.folders for delete
  to anon using (true);

-- 7. 按目录+月份查询的索引
create index if not exists documents_folder_date_idx
  on public.documents (folder_id, category_date desc);