"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import { useClasses } from "@/lib/use-classes";

/**
 * Printable ID cards.
 *
 * The cards are rendered as a PDF on the server with each photograph embedded
 * in the file. That is the point rather than a detail: a web version would
 * need every child's photograph at a URL a browser could fetch, and a
 * photograph of a child at an address that can be shared, guessed, cached by
 * a proxy or left in a browser history is exactly what must not exist.
 */
export default function IdCardsPage() {
  const { data: classes } = useClasses();
  const accessToken = useAuthQueryState().accessToken;
  const [classId, setClassId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setNote(null);
    try {
      // Fetched with the bearer token, handed over as a blob. A plain link
      // would send the browser without the token, and making that work would
      // mean serving children's photographs unauthenticated.
      const response = await fetch(`/v1/id-cards?classId=${encodeURIComponent(classId)}`, {
        headers: authHeaders(accessToken) as HeadersInit,
      });
      if (!response.ok) throw new Error("Could not produce those cards");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `id-cards-${classes?.find((c) => c.id === classId)?.name ?? "class"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNote("Downloaded.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not produce those cards");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Student ID cards</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Ten to an A4 sheet, ready to cut. Each card carries the child&rsquo;s name, class, admission number
          and photograph, and the school&rsquo;s own number for whoever finds it.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Class
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className="mt-1 block w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Choose a class…</option>
              {classes?.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name} · {schoolClass.academicYear}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={download}
            disabled={busy || !classId}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Preparing…" : "Download cards"}
          </button>
        </div>
        {note && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{note}</p>}
      </section>

      {/* Both of these are decisions somebody would otherwise discover by
          printing thirty cards and looking at them. */}
      <section className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          What is and is not on a card
        </p>
        <p className="mt-2">
          A card carries the child&rsquo;s name, their class, their admission number and their photograph, and
          says to return it to the school with the school&rsquo;s telephone number.
        </p>
        <p className="mt-2">
          It does <strong>not</strong> carry a home address, a date of birth, a parent&rsquo;s telephone
          number or anything medical. A school ID is carried by a child, lost by a child, and picked up by
          strangers — it should identify them to the school and to nobody else.
        </p>
        <p className="mt-2">
          A child with no photograph on file still gets a card, with a blank where the picture goes. Refusing
          would leave the children whose families have not sent one as the only children without a card.
        </p>
      </section>
    </div>
  );
}
