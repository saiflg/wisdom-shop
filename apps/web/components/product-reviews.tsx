"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { StarRating } from "@/components/star-rating";
import {
  explainRefusal,
  useCreateReview,
  useDeleteReview,
  useReviewEligibility,
  useReviews,
  useUpdateReview,
  type Review,
} from "@/lib/use-reviews";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

function RatingPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="text-sm font-medium">Your rating</legend>
      {[1, 2, 3, 4, 5].map((star) => (
        <label key={star} className="cursor-pointer">
          {/* A real radio group rather than clickable icons, so the control
              is reachable by keyboard and announced as a choice. */}
          <input
            type="radio"
            name="rating"
            value={star}
            checked={value === star}
            onChange={() => onChange(star)}
            className="sr-only"
          />
          <span className={star <= value ? "text-amber-400" : "text-slate-300 dark:text-slate-700"}>
            <svg aria-hidden viewBox="0 0 20 20" className="h-7 w-7" fill="currentColor">
              <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z" />
            </svg>
          </span>
          <span className="sr-only">{star} star{star === 1 ? "" : "s"}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ReviewForm({ slug, existing }: { slug: string; existing: Review | null }) {
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const create = useCreateReview(slug);
  const update = useUpdateReview(slug);
  const pending = create.isPending || update.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);

    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, rating, title, body });
      } else {
        await create.mutateAsync({ rating, title, body });
      }
      setDone(true);
    } catch (err) {
      // The API distinguishes "never bought it" from "not paid for yet" and
      // from "already reviewed"; its wording is the useful one.
      setError(err instanceof ApiError ? err.message : "Couldn't save that review.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <h3 className="text-base font-semibold">{existing ? "Edit your review" : "Write a review"}</h3>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          Thanks — your review is live.
        </p>
      )}

      <div className="mt-4 space-y-4">
        <RatingPicker value={rating} onChange={setRating} />

        <div>
          <label htmlFor="review-title" className="block text-sm font-medium">Title (optional)</label>
          <input
            id="review-title"
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>

        <div>
          <label htmlFor="review-body" className="block text-sm font-medium">Your review (optional)</label>
          <textarea
            id="review-body"
            rows={4}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : existing ? "Save changes" : "Post review"}
      </button>
    </form>
  );
}

export function ProductReviews({ slug }: { slug: string }) {
  const status = useAuthStore((s) => s.status);
  const currentUser = useAuthStore((s) => s.user);

  const { data, isLoading } = useReviews(slug);
  const { data: eligibility } = useReviewEligibility(slug);
  const remove = useDeleteReview(slug);

  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const yourReview = eligibility?.yourReview ?? null;

  return (
    <section className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800">
      <h2 className="text-xl font-bold tracking-tight">Reviews</h2>

      {isLoading && <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading reviews…</p>}

      {data && (
        <>
          {data.summary.count > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <StarRating value={data.summary.average} size="lg" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <strong className="text-slate-900 dark:text-slate-100">{data.summary.average}</strong> out
                of 5 · {data.summary.count} review{data.summary.count === 1 ? "" : "s"}
              </p>
            </div>
          ) : (
            // The eligibility line below already explains who may review, so
            // repeating it here showed the same sentence twice.
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
              No reviews yet.
            </p>
          )}

          {data.summary.count > 0 && (
            <ul className="mt-3 max-w-sm space-y-1">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = data.summary.distribution[String(star)] ?? 0;
                const pct = data.summary.count === 0 ? 0 : (count / data.summary.count) * 100;
                return (
                  <li key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-10 text-slate-600 dark:text-slate-400">{star} star</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <span className="block h-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-6 text-right text-slate-500">{count}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {actionError && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      <div className="mt-6 space-y-4">
        {status !== "authenticated" && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            <Link href="/login" className="text-brand-600 hover:underline dark:text-brand-400">
              Sign in
            </Link>{" "}
            to review a product you&apos;ve bought.
          </p>
        )}

        {eligibility?.canReview && <ReviewForm slug={slug} existing={null} />}

        {yourReview && editing && <ReviewForm slug={slug} existing={yourReview} />}

        {yourReview && !editing && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-600 dark:text-slate-400">You reviewed this product.</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium transition hover:border-brand-400 dark:border-slate-700"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Remove your review?")) return;
                setActionError(null);
                try {
                  await remove.mutateAsync(yourReview.id);
                } catch (err) {
                  setActionError(err instanceof ApiError ? err.message : "Couldn't remove that review.");
                }
              }}
              disabled={remove.isPending}
              className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:border-red-400 disabled:opacity-60 dark:border-red-900 dark:text-red-400"
            >
              Remove
            </button>
          </div>
        )}

        {status === "authenticated" &&
          eligibility &&
          !eligibility.canReview &&
          eligibility.reason !== "already-reviewed" && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {explainRefusal(eligibility.reason)}
            </p>
          )}
      </div>

      {data && data.data.length > 0 && (
        <ul className="mt-8 space-y-5">
          {data.data.map((review) => (
            <li key={review.id} className="border-t border-slate-200 pt-5 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-3">
                <StarRating value={review.rating} />
                <span className="text-sm font-medium">{review.authorName}</span>
                {review.authorUserId === currentUser?.id && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    yours
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {new Date(review.createdAt).toLocaleDateString()}
                </span>
              </div>
              {review.title && <p className="mt-2 font-medium">{review.title}</p>}
              {review.body && (
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">
                  {review.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
