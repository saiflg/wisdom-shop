"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { errorMessage } from "@/lib/api";
import { useAuthQueryState } from "@/lib/api-auth";

const SIZES = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-12 w-12 text-sm",
  lg: "h-24 w-24 text-2xl",
} as const;

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Somebody's face, or their initials.
 *
 * Initials are the resting state, not a placeholder to be embarrassed about:
 * photographs are optional everywhere, and a school that never uploads one
 * should not be looking at broken image icons for the rest of its life.
 *
 * The image is fetched through the ordinary authorised route, so a viewer who
 * is not allowed this face gets a 404 and quietly keeps the initials.
 */
export function PersonPhoto({
  userId,
  name,
  size = "md",
  version,
}: {
  userId: string;
  name: string;
  size?: keyof typeof SIZES;
  /** Change this to bust the browser cache after an upload. */
  version?: string | number;
}) {
  const [failed, setFailed] = useState(false);
  const src = `/v1/people/${userId}/photo${version ? `?v=${version}` : ""}`;

  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={clsx(
          "flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300",
          SIZES[size],
        )}
      >
        {initials(name)}
      </span>
    );
  }

  // next/image would need a custom loader for an authenticated same-origin
  // route, and this is a 96px portrait rather than a hero image — the
  // optimisation it offers is not the thing that matters here.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${name}'s photo`}
      onError={() => setFailed(true)}
      className={clsx("shrink-0 rounded-full object-cover", SIZES[size])}
    />
  );
}

/**
 * The photo plus the controls to change it.
 *
 * Only rendered where somebody is allowed to change it — the API refuses
 * anyway, but offering a button that always fails is its own kind of lie.
 */
export function PersonPhotoEditor({ userId, name }: { userId: string; name: string }) {
  const { accessToken } = useAuthQueryState();
  const fileInput = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const upload = async (file: File) => {
    setProblem(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/v1/people/${userId}/photo`, {
        method: "POST",
        credentials: "include",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => undefined);
        throw new Error((data as { message?: string } | undefined)?.message ?? "Couldn't upload that photo.");
      }
      // The URL is unchanged, so without this the browser shows the old one.
      setVersion(Date.now());
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't upload that photo."));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const remove = async () => {
    setProblem(null);
    setBusy(true);
    try {
      const res = await fetch(`/v1/people/${userId}/photo`, {
        method: "DELETE",
        credentials: "include",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new Error("Couldn't remove that photo.");
      setVersion(Date.now());
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't remove that photo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <PersonPhoto userId={userId} name={name} size="lg" version={version} />

      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {busy ? "Working…" : "Change photo"}
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-red-950/30"
          >
            Remove
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Optional. PNG, JPEG or WebP, up to 2 MB. Only staff, this person, and their classmates can see it.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={`Upload a photo for ${name}`}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        {problem && (
          <p role="alert" className="text-sm text-red-600">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
