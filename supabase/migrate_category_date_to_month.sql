-- =============================================================
-- 工作台 - 迁移：category_date 由 date 改为 varchar(7)（YYYY-MM 月份）
-- 使用方法：打开 Supabase Dashboard -> SQL Editor -> New query，
--          粘贴本脚本并 Run。
-- 说明：category_date 当前为 date 类型，用 to_char 转成月份字符串
--       'YYYY-MM' 存为 varchar(7)。可重复执行（幂等）。
-- =============================================================

alter table public.documents
  alter column category_date type varchar(7)
  using to_char(category_date::date, 'YYYY-MM');

alter table public.documents
  alter column category_date set not null;