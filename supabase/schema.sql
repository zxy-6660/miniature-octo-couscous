-- =============================================================
-- 工作台 - Supabase 初始化脚本
-- 使用方法：打开 Supabase Dashboard -> SQL Editor -> New query，
--          粘贴本脚本并 Run。
-- 说明：本脚本创建 documents 表、Storage Bucket 及对应 RLS 策略。
--       为便于个人工具直接使用，策略采用宽松（anon 可读可写）方式。
--       若需部署到生产，请用 Supabase Auth 替换为 is_authenticated。
-- =============================================================

-- 1. 启用 gen_random_uuid() 需要的扩展
create extension if not exists pgcrypto;

-- 2. 创建目录表 folders（需在 documents 之前，因 documents 有外键引用）
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.folders(id), -- 父目录，顶层为 null（支持无限嵌套）
  created_at timestamptz not null default now()
);

insert into public.folders (name)
values ('默认')
on conflict (name) where (parent_id is null)
do nothing;

-- 子目录按父目录查询的索引
create index if not exists folders_parent_idx
  on public.folders (parent_id);

-- 同一父目录下名称唯一（顶层以哨牙齿作为父键，允许不同父目录下同名）
create unique index if not exists folders_parent_name_idx
  on public.folders (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

-- 3. 创建文档表
-- 注：category_date 存 YYYY-MM 月份，使用 varchar(7)（date 类型无法只精确到月份）
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_file_name text not null,
  file_path text not null unique,
  folder_id uuid not null references public.folders(id),
  category_date varchar(7) not null,
  file_size bigint not null default 0,
  status text not null default '未使用'
    check (status in ('未使用', '已使用')),
  remark text,
  note text,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 按目录+月份查询的索引
create index if not exists documents_folder_date_idx
  on public.documents (folder_id, category_date desc);

-- 3. 自动更新时间戳
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- 4. 开启 RLS 并添加宽松策略（anon 可读可写）
alter table public.documents enable row level security;

-- folders 的宽松 anon 策略（与 documents 保持一致）
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

drop policy if exists "anon_documents_select" on public.documents;
create policy "anon_documents_select"
  on public.documents for select
  to anon using (true);

drop policy if exists "anon_documents_insert" on public.documents;
create policy "anon_documents_insert"
  on public.documents for insert
  to anon with check (true);

drop policy if exists "anon_documents_update" on public.documents;
create policy "anon_documents_update"
  on public.documents for update
  to anon using (true) with check (true);

drop policy if exists "anon_documents_delete" on public.documents;
create policy "anon_documents_delete"
  on public.documents for delete
  to anon using (true);

-- 5. 创建 Storage Bucket（私密桶，读取经由对象签名/直链）
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- 6. Storage 对象读写策略（anon）
drop policy if exists "anon_documents_objects_select" on storage.objects;
create policy "anon_documents_objects_select"
  on storage.objects for select
  to anon using (bucket_id = 'documents');

drop policy if exists "anon_documents_objects_insert" on storage.objects;
create policy "anon_documents_objects_insert"
  on storage.objects for insert
  to anon with check (bucket_id = 'documents');

drop policy if exists "anon_documents_objects_delete" on storage.objects;
create policy "anon_documents_objects_delete"
  on storage.objects for delete
  to anon using (bucket_id = 'documents');