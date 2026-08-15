"use client";

import { useEffect, useState } from "react";
import { fetchAttachment, type ChatAttachment } from "@/lib/use-class-chat";
import { useAuthQueryState } from "@/lib/api-auth";

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clock(seconds: number | null): string | null {
  if (!seconds) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

/**
 * A file somebody shared, fetched with the viewer's token.
 *
 * The bytes live behind an authorised route, so a plain <img src> would
 * arrive without the bearer token and 401. Everything here is fetched, turned
 * into an object URL, and revoked on unmount — otherwise a class chat left
 * open all afternoon accumulates every photograph it ever showed.
 */
export function ChatAttachmentView({ attachment }: { attachment: ChatAttachment }) {
  const { accessToken } = useAuthQueryState();
  const [href, setHref] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // A PDF is not previewed, so its bytes are only fetched when asked for.
  const previewable = attachment.kind === "IMAGE" || attachment.kind === "AUDIO";

  useEffect(() => {
    if (!previewable) return;
    let url: string | null = null;
    let cancelled = false;

    fetchAttachment(attachment.url, accessToken)
      .then((objectUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        url = objectUrl;
        setHref(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.url, accessToken, previewable]);

  const download = async () => {
    try {
      const objectUrl = await fetchAttachment(attachment.url, accessToken);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.displayName;
      link.click();
      // Revoked on the next tick: revoking immediately can beat the download.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch {
      setFailed(true);
    }
  };

  if (failed) {
    return <p className="mt-1 text-xs text-slate-500">Couldn&apos;t load {attachment.displayName}.</p>;
  }

  if (attachment.kind === "IMAGE") {
    return (
      <a href={href ?? undefined} target="_blank" rel="noreferrer noopener" className="mt-1.5 block">
        {href ? (
          // eslint-disable-next-line @next/next/no-img-element -- an object URL, not a remote asset next/image can optimise
          <img
            src={href}
            alt={attachment.displayName}
            className="max-h-64 w-auto max-w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700"
          />
        ) : (
          <span className="block h-24 w-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        )}
      </a>
    );
  }

  if (attachment.kind === "AUDIO") {
    return (
      <div className="mt-1.5">
        {href ? (
          <audio controls src={href} className="h-10 w-full max-w-xs">
            <track kind="captions" />
          </audio>
        ) : (
          <span className="block h-10 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        )}
        <span className="text-xs text-slate-500">
          Voice note{clock(attachment.durationSeconds) ? ` · ${clock(attachment.durationSeconds)}` : ""}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void download()}
      className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-left text-xs transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      <span aria-hidden className="text-base">
        📄
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{attachment.displayName}</span>
        <span className="text-slate-500">PDF · {readableSize(attachment.byteSize)} · tap to download</span>
      </span>
    </button>
  );
}
