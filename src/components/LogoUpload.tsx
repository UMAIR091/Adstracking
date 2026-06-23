"use client";

import { useRef, useState } from "react";
import { UploadCloud, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Drag-and-drop logo uploader → Supabase Storage ('logos' bucket) → returns public URL.
export function LogoUpload({
  value,
  onChange,
  folder,
}: {
  value: string;
  onChange: (url: string) => void;
  folder: string;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    if (file.size > 4 * 1024 * 1024) return toast.error("Image must be under 4 MB.");
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) {
      setUploading(false);
      return toast.error(`Upload failed: ${error.message}`);
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
    toast.success("Logo uploaded");
  }

  if (value) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Logo" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="text-sm font-medium text-brand-600 hover:underline">
            Replace
          </button>
          <button type="button" onClick={() => onChange("")} className="flex items-center gap-1 text-sm text-ink-500 hover:text-red-600">
            <X size={14} /> Remove
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]); }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
        dragOver ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-slate-100/60"
      )}
    >
      {uploading ? (
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      ) : (
        <UploadCloud className="h-6 w-6 text-ink-400" />
      )}
      <p className="text-sm font-medium text-ink-700">
        {uploading ? "Uploading…" : "Upload logo"}
      </p>
      <p className="text-xs text-ink-400">Drag & drop or click — PNG/JPG/SVG, up to 4 MB</p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
    </div>
  );
}
