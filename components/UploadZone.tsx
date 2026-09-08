"use client";

import { useCallback, useRef, useState } from "react";

interface UploadZoneProps {
  onUpload: (files: File[]) => Promise<void>;
  uploading: boolean;
}

export default function UploadZone({ onUpload, uploading }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const docx = Array.from(fileList).filter((f) => {
        const name = f.name.toLowerCase();
        return name.endsWith(".docx");
      });
      if (docx.length > 0) onUpload(docx);
    },
    [onUpload]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
        dragOver
          ? "border-blue-500 bg-blue-50"
          : "border-zinc-300 bg-zinc-50 hover:border-blue-400 hover:bg-blue-50/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-2xl">
        📄
      </div>
      <p className="text-base font-medium text-zinc-800">
        {uploading ? "正在上传…" : "点击选择或拖拽上传文档"}
      </p>
      <p className="mt-1 text-sm text-zinc-500">仅支持 .docx 格式</p>
    </div>
  );
}