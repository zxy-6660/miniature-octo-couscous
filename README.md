# 📚 工作台（Web Workbench）

一个基于 **Next.js + Supabase** 的文档管理工作台。支持上传 `.docx` 文档、按日期归档、在网页内直接阅读，并可将文档标记为「已使用」（标记时需填写备注）。

> 数据库采用 Supabase（PostgreSQL），docx 文件存储在 Supabase Storage。可一键部署到 Vercel。

## ✨ 功能

- 📄 上传 `.docx` / `.doc` 文档（点击或拖拽，支持多选）

- 🗂 按日期自动分类归档（使用上传当天日期）

- 📖 网页内直接阅读文档（mammoth 将 docx 渲染为 HTML，保留标题、表格、图片等）

- ✅ 标记文档为「已使用」，标记时必须填写备注

- ↩️ 支持撤销「已使用」标记、删除文档

- 🔢 顶部统计：全部 / 未使用 / 已使用数量

## 🧱 技术栈

- Next.js 16（App Router + Turbopack）

- React 19

- Supabase（PostgreSQL + Storage + RLS）

- mammoth（docx → HTML）

- Tailwind CSS 4

## 🚀 快速开始

### 1. 创建 Supabase 项目

1. 前往 <https://supabase.com> 注册并创建新项目（选择区域）。
2. 在 **SQL Editor** 中新建查询，粘贴执行 [`supabase/schema.sql`](supabase/schema.sql)：

   - 创建 `documents` 表

   - 创建 `documents` 存储桶

   - 配置 RLS 与存储策略
3. 在 **Settings → API** 页面记录：

   - **Project URL**（如 `https://xxxxx.supabase.co`）

   - **anon public** 密钥

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local` 并填写：

```env
NEXT_PUBLIC_SUPABASE_URL=https://你的项目url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon公钥
```

> 我已在本项目目录放置 `.env.local`（含占位值），请替换为真实值后再启动。

### 3. 本地运行

```bash
npm install
npm run dev
```

打开 <http://localhost:3000> 即可使用。

## ☁️ 部署到 Vercel

1. 将项目推送到 GitHub 仓库。

2. 在 [Vercel](https://vercel.com/new) 导入该仓库（框架应自动识别为 Next.js）。

3. 在 Vercel 项目设置 → **Environment Variables** 中，添加：

   | 变量                              | 值                 |
   | ------------------------------- | ----------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | 你的 Project URL    |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你的 anon public 密钥 |

4. 点击 **Deploy**，部署完成后即可通过 Vercel 域名访问。

## 🗄 数据表结构

| 字段                          | 类型          | 说明               |
| --------------------------- | ----------- | ---------------- |
| `id`                        | uuid        | 主键               |
| `title`                     | text        | 展示标题（去除扩展名）      |
| `client_file_name`          | text        | 原始文件名            |
| `file_path`                 | text        | Storage 存储路径（唯一） |
| `category_date`             | varchar(7)  | 归档月份 `YYYY-MM`   |
| `file_size`                 | bigint      | 文件大小（字节）         |
| `status`                    | text        | `未使用` / `已使用`    |
| `remark`                    | text        | 「已使用」时的备注        |
| `used_at`                   | timestamptz | 标记为已使用的时间        |
| `created_at` / `updated_at` | timestamptz | 创建 / 更新时间        |

## ⚠️ 安全说明

为方便个人/团队快速使用，`schema.sql` 中的 RLS 策略设为宽松模式（anon 可直接读写），**不包含用户鉴权**。若需部署到公网生产环境，建议：

- 接入 Supabase Auth，并将表与存储的策略从 `for anon using (true)` 改为 `for authenticated using ((select auth.uid()) is not null)`；

- 将存储桶设为私有（默认已私有），文件通过签名 URL 访问。

## 目录结构

```
app/
  page.tsx            # 首页（渲染工作台）
  layout.tsx          # 全局布局
components/
  Workbench.tsx       # 主工作台（上传/列表/标记/删除）
  UploadZone.tsx      # 上传区
  DocumentReader.tsx  # 网页内阅读器
  MarkUsedModal.tsx   # 标记已使用备注弹窗
lib/
  supabase.ts         # Supabase 客户端
  types.ts            # 类型定义
supabase/
  schema.sql          # 数据库/存储初始化脚本
```

