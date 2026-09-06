"use client";

import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

const ROADMAP: { title: TranslationKey; description: TranslationKey }[] = [
  { title: "home.adminTitle", description: "home.adminBlurb" },
  { title: "home.curriculumTitle", description: "home.curriculumBlurb" },
  // The tutor keeps its product name, which is the same word in every
  // language; only the sentence under it is translated.
  { title: "nav.academics.aiTeaching", description: "home.tutorBlurb" },
  { title: "home.tenantTitle", description: "home.tenantBlurb" },
];

export default function ComingSoonPage() {
  const { t } = useTranslation();
  const shopUrl = process.env.NEXT_PUBLIC_SHOP_URL ?? "http://localhost:3000";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-block rounded-full bg-brand-gradient px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white">
          {t("home.badge")}
        </span>

        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          Wisdom{" "}
          <span className="bg-brand-gradient bg-clip-text text-transparent">Campus</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-400">
          {t("home.blurb")}
        </p>

        <a
          href={shopUrl}
          className="mt-8 inline-block rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold transition hover:border-brand-400 dark:border-slate-700"
        >
          {t("home.backToShop")}
        </a>
      </div>

      <div className="mx-auto mt-16 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {ROADMAP.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-slate-200 p-5 text-start dark:border-slate-800"
          >
            <h2 className="font-semibold">{t(item.title)}</h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{t(item.description)}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
