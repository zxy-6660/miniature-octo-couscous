import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 浏览器端客户端：用于读写数据、上传/下载文件（依赖 RLS 策略）
export const supabase = createClient(supabaseUrl, supabaseAnonKey);