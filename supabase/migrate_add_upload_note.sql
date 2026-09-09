-- 上传文件时新增备注字段（幂等，可重复执行）
alter table public.documents
  add column if not exists upload_note text;