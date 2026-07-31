"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useUploadImage } from "@/lib/use-uploads";

/**
 * Uploads an image and appends its URL to the textarea the form already
 * submits.
 *
 * Deliberately additive rather than a replacement: URLs typed by hand still
 * work, so imagery already hosted elsewhere does not have to be re-uploaded
 * to keep using this screen.
 */
export function ImageUploader({ onUploaded }: { onUploaded: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadImage();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const result = await upload.mutateAsync(file);
        onUploaded(result.url);
      }
    } catch (err) {
      // The API explains the type and size rules precisely, including why
      // SVG is refused — that wording is more useful than a generic failure.
      setError(err instanceof ApiError ? err.message : "That upload failed.");
    } finally {
      // Cleared so the same file can be picked again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        aria-label="Upload product images"
        onChange={(e) => handleFiles(e.target.files)}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-gradient file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-90"
      />
      {upload.isPending && (
        <p className="mt-1 text-xs text-slate-500">Uploading…</p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
