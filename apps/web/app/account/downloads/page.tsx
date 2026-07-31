import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountNav } from "@/components/account-nav";
import { DownloadsList } from "./downloads-list";

export const metadata: Metadata = { title: "Your downloads — Wisdom Shop" };

export default function DownloadsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Your downloads</h1>
        <AccountNav />
        <DownloadsList />
      </main>
    </>
  );
}
