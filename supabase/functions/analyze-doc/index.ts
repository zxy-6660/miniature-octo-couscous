// Supabase Edge Function：分析文档用到的技术，并写回 documents.note
// 调用方式（浏览器端）：
//   POST {SUPABASE_URL}/functions/v1/analyze-doc
//   Header: Authorization: Bearer <anon key>
//   Body:   { "docId": "<uuid>", "text": "<文档纯文本>", "hasAny": "<可选，是否已有备注>" }

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (req.method !== "POST") return json({ error: "仅支持 POST" }, 405);

  if (!deepseekKey) return json({ error: "服务端未配置 DEEPSEEK_API_KEY" }, 500);

  let body: { docId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "请求体不是有效 JSON" }, 400);
  }

  const docId = body.docId;
  const text = (body.text || "").toString();

  if (!docId || !text.trim()) {
    return json({ error: "缺少 docId 或 text" }, 400);
  }

  // 限制送入模型的文本长度，避免超 token
  const truncated = text.slice(0, 12000);

  const systemPrompt =
    "你是一个文档技术分析助手。请阅读用户提供的文档内容，" +
    "提取其中用到的技术、工具、方法、软件或专业名词（例如某项检查、某个标准、某种材料、某个算法等），" +
    "用中文简洁列出，条目用顿号或分号分隔，直接输出结果，不要附加任何解释或前缀。";

  try {
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: truncated },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: `DeepSeek 调用失败 (${resp.status}): ${errText}` }, 502);
    }

    const data = await resp.json();
    const note =
      data?.choices?.[0]?.message?.content?.trim() || "";

    // 写回数据库
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { error: upErr } = await supabase
      .from("documents")
      .update({ note: note || null })
      .eq("id", docId);
    if (upErr) return json({ error: "写入备注失败: " + upErr.message }, 500);

    return json({ ok: true, note });
  } catch (e) {
    return json({ error: "内部错误: " + (e instanceof Error ? e.message : e) }, 500);
  }
});