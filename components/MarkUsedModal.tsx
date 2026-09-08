"use client";

import { useState } from "react";

interface MarkUsedModalProps {
  docTitle: string;
  initialRemark?: string | null;
  onConfirm: (remark: string) => Promise<void>;
  onClose: () => void;
}

export default function MarkUsedModal({
  docTitle,
  initialRemark,
  onConfirm,
  onClose,
}: MarkUsedModalProps) {
  const [remark, setRemark] = useState(initialRemark || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onConfirm(remark.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-zinc-800">
          标记为「已使用」
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          文档：<span className="font-medium text-zinc-700">{docTitle}</span>
        </p>
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            备注 <span className="text-zinc-400">（必填，记录使用情况）</span>
          </label>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={4}
            autoFocus
            placeholder="例如：2026-09-08 已用于季度汇报，内部评审通过。"
            className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={saving || !remark.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中…" : "确认标记"}
          </button>
        </div>
      </div>
    </div>
  );
}