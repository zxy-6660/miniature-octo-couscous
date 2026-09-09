-- 新增“文件备注”字段（独立于“已使用”时的备注 remark）
-- 可重复执行（幂等）：列已存在时不会报错
alter table public.documents
  add column if not exists note text;