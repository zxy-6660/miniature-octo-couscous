// 文档状态
export type DocumentStatus = "未使用" | "已使用";

// 目录
export interface FolderRecord {
  id: string;
  name: string; // 目录名称（用户自由输入）
  created_at: string;
}

export interface DocRecord {
  id: string;
  title: string; // 展示标题（可编辑的中文名称）
  client_file_name: string; // 原始文件名（含扩展名）
  file_path: string; // 存储桶中的路径
  folder_id: string; // 所属目录
  category_date: string; // 归档月份 YYYY-MM
  file_size: number; // 字节
  status: DocumentStatus;
  remark: string | null; // 标记“已使用”时的备注（可空）
  used_at: string | null; // 标记为已使用的时间
  created_at: string;
  updated_at: string;
}

// 按月份分组的结果
export interface DateGroup {
  date: string; // YYYY-MM
  docs: DocRecord[];
}