"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import { useAuthStore } from "@/store/auth-store";

interface ChannelHealth {
  channel: "EMAIL" | "SMS";
  health: "HEALTHY" | "DEGRADED" | "BROKEN" | "NOT_SET_UP" | "IDLE";
  sent: number;
  failed: number;
  headline: string;
  action: string | null;
}

interface GatewayHealth {
  channels: ChannelHealth[];
  needsAttention: boolean;
  banner: string | null;
}

/**
 * Tells a school its messages are not arriving.
 *
 * The outbox has always recorded every failure and nothing ever read it back,
 * so a school with a wrong SMTP password kept pressing send and found out
 * when a parent said they were never told. The system knew on the first
 * message.
 *
 * Shown only to administrators, and only when something is genuinely wrong —
 * a gateway that was never set up is not a fault, and a banner that cries
 * wolf is a banner nobody reads.
 */
export function GatewayHealthBanner() {
  const { accessToken, enabled } = useAuthQueryState();
  const isAdmin = useAuthStore((state) => state.user?.roles.includes("SCHOOL_ADMIN")) ?? false;

  const { data } = useQuery({
    queryKey: ["messaging", "health"],
    enabled: enabled && isAdmin,
    // Checked on arrival, not on a poll: reading the outbox on a timer to
    // tell somebody something they can only fix once would be waste.
    staleTime: 5 * 60_000,
    queryFn: () => apiFetch<GatewayHealth>("/v1/messaging/health", { headers: authHeaders(accessToken) }),
  });

  if (!isAdmin || !data?.needsAttention) return null;

  const broken = data.channels.filter((c) => c.health === "BROKEN" || c.health === "DEGRADED");

  return (
    <div
      role="alert"
      className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30"
    >
      <p className="text-sm font-semibold text-red-900 dark:text-red-200">
        {broken.some((c) => c.health === "BROKEN")
          ? "Messages to families are not arriving"
          : "Some messages to families are not arriving"}
      </p>

      <ul className="mt-1 space-y-1">
        {broken.map((channel) => (
          <li key={channel.channel} className="text-sm text-red-800 dark:text-red-300">
            {channel.headline}.{channel.action ? ` ${channel.action}` : ""}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-sm">
        <Link href="/settings/communication" className="font-semibold text-red-900 underline dark:text-red-200">
          Check the gateway settings
        </Link>
        <span className="text-red-800 dark:text-red-300"> · </span>
        <Link href="/messaging/outbox" className="font-semibold text-red-900 underline dark:text-red-200">
          See what failed
        </Link>
      </p>
    </div>
  );
}
