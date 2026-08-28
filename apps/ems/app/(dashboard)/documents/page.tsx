"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import { useCanAuthor, useIsSchoolAdmin } from "@/lib/use-can-author";
import { useStudents } from "@/lib/use-students";
import { usePortalChildren } from "@/lib/use-wallet";

interface Document {
  id: string;
  label: string;
  mimeType: string;
  bytes: number;
  uploadedByName: string;
  createdAt: string;
}

const KEY = ["documents"];

function useDocuments(studentProfileId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    queryFn: () =>
      apiFetch<Document[]>(`/v1/documents/students/${studentProfileId}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Papers held for one child.
 *
 * Every file is fetched through an authenticated request and handed to the
 * browser as a download. There is no URL anywhere in this system that serves
 * a child's birth certificate to whoever has the address — which is why the
 * download here goes through fetch and a blob rather than a plain link.
 */
export default function DocumentsPage() {
  const isStaff = useCanAuthor();
  const { data: students } = useStudents();
  const { data: children } = usePortalChildren(!isStaff);
  const [chosen, setChosen] = useState<string | null>(null);

  const options = isStaff
    ? (students ?? []).map((s) => ({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}` }))
    : (children ?? []).map((c) => ({ id: c.id, name: `${c.user.firstName} ${c.user.lastName}` }));

  const current = chosen ?? (options.length === 1 ? (options[0]?.id ?? null) : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Papers the school holds for a child — birth certificates, immunisation records, transfer letters.
        </p>
      </div>

      {options.length > 1 && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {isStaff ? "Student" : "Child"}
          <select
            value={current ?? ""}
            onChange={(event) => setChosen(event.target.value || null)}
            className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Choose…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {current && <Documents studentProfileId={current} isStaff={isStaff} />}
    </div>
  );
}

function Documents({ studentProfileId, isStaff }: { studentProfileId: string; isStaff: boolean }) {
  const { data, isLoading } = useDocuments(studentProfileId);

  return (
    <div className="space-y-4">
      {isStaff && <Upload studentProfileId={studentProfileId} />}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {data?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Nothing held for this child.</p>
      )}

      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {data?.map((document) => (
          <DocumentRow key={document.id} document={document} />
        ))}
      </ul>
    </div>
  );
}

function DocumentRow({ document: doc }: { document: Document }) {
  const isAdmin = useIsSchoolAdmin();
  const queryClient = useQueryClient();
  const accessToken = useAuthQueryState().accessToken;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () =>
      apiFetch(`/v1/documents/${doc.id}`, { method: "DELETE", headers: authHeaders(accessToken) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  /*
   * Fetched with the bearer token and handed over as a blob.
   *
   * A plain <a href> would send the browser to the API without the token,
   * and the only way to make that work would be putting the file somewhere
   * unauthenticated — which is the thing this design exists to avoid.
   */
  const download = async () => {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(`/v1/documents/${doc.id}/file`, {
        headers: authHeaders(accessToken) as HeadersInit,
      });
      if (!response.ok) throw new Error("Could not fetch that document");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = doc.label;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not download that");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{doc.label}</p>
        <p className="text-xs text-slate-500">
          {readableSize(doc.bytes)} · {doc.uploadedByName} ·{" "}
          {new Date(doc.createdAt).toLocaleDateString()}
        </p>
        {note && <p className="text-xs text-red-600">{note}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-50 dark:border-slate-700"
        >
          {busy ? "Fetching…" : "Download"}
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => remove.mutateAsync()}
            disabled={remove.isPending}
            className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 disabled:opacity-50 dark:border-red-900"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function Upload({ studentProfileId }: { studentProfileId: string }) {
  const queryClient = useQueryClient();
  const accessToken = useAuthQueryState().accessToken;
  const input = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const file = input.current?.files?.[0];
    if (!file) {
      setError("Choose a file");
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("label", label.trim());

      const response = await fetch(`/v1/documents/students/${studentProfileId}`, {
        method: "POST",
        headers: authHeaders(accessToken) as HeadersInit,
        body,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new ApiError(response.status, payload?.message ?? "Could not upload that");
      }

      setLabel("");
      if (input.current) input.current.value = "";
      await queryClient.invalidateQueries({ queryKey: KEY });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Attach a document</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          required
          maxLength={200}
          placeholder="Birth certificate"
          aria-label="What the document is"
          className="w-52 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          aria-label="File"
          className="text-sm"
        />
        <button
          type="submit"
          disabled={busy || !label.trim()}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        PDF, JPEG, PNG or WebP, up to 10 MB. Stored where only signed-in staff and this child&rsquo;s own
        family can reach it — there is no public link.
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}
