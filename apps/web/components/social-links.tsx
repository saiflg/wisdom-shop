"use client";

import type { ReactNode } from "react";
import { useSocialLinks } from "@/lib/use-settings";

/**
 * Generic pictograms rather than exact brand marks — recognisable at a
 * glance without reproducing anyone's trademarked logo artwork.
 */
const PLATFORMS: { key: string; label: string; icon: ReactNode }[] = [
  {
    key: "SOCIAL_FACEBOOK_URL",
    label: "Facebook",
    icon: (
      <path
        d="M14 21v-7h2.5l.5-3H14V9c0-.9.3-1.5 1.6-1.5H17V5c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2V11H8v3h2.5v7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    key: "SOCIAL_INSTAGRAM_URL",
    label: "Instagram",
    icon: (
      <>
        <rect x="4.5" y="4.5" width="15" height="15" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="16.3" cy="7.7" r="0.9" fill="currentColor" />
      </>
    ),
  },
  {
    key: "SOCIAL_X_URL",
    label: "X (Twitter)",
    icon: (
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    ),
  },
  {
    key: "SOCIAL_YOUTUBE_URL",
    label: "YouTube",
    icon: (
      <>
        <rect x="3.5" y="6.5" width="17" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.5 9.8v4.4l4-2.2z" fill="currentColor" />
      </>
    ),
  },
  {
    key: "SOCIAL_LINKEDIN_URL",
    label: "LinkedIn",
    icon: (
      <>
        <rect x="4.5" y="4.5" width="15" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="8.3" cy="8.7" r="1" fill="currentColor" />
        <path
          d="M8.3 11.2v4.6M12 15.8v-2.9c0-1.1.7-1.8 1.7-1.8s1.6.7 1.6 1.8v2.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    key: "SOCIAL_TIKTOK_URL",
    label: "TikTok",
    icon: (
      <path
        d="M13 4v10.2a2.6 2.6 0 1 1-2-2.5M13 4c.3 2 1.8 3.5 3.7 3.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    key: "SOCIAL_WHATSAPP_URL",
    label: "WhatsApp",
    icon: (
      <path
        d="M6.5 17.5 5 20l2.6-1.4A7 7 0 1 0 5 12a6.9 6.9 0 0 0 1 3.6ZM9.5 9.8c.2-.5.5-.5.7-.5h.5c.2 0 .4 0 .5.4l.6 1.5c.1.2 0 .4-.1.5l-.5.6c-.1.2-.1.3 0 .5.3.5.9 1.2 1.4 1.5.2.2.4.2.5 0l.5-.6c.2-.2.3-.2.5-.1l1.4.7c.2.1.3.2.3.4 0 .8-.6 1.3-1.3 1.4-1 .1-2.5-.4-4-1.9-1.3-1.2-1.9-2.4-2-3.3 0-.5.1-.9.4-1.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export function SocialLinks() {
  const { data } = useSocialLinks();
  const active = PLATFORMS.filter((p) => data?.[p.key]);

  if (active.length === 0) return null;

  return (
    <ul className="flex items-center gap-2">
      {active.map((platform) => (
        <li key={platform.key}>
          <a
            href={data![platform.key]}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={platform.label}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-brand-400 dark:hover:text-brand-400"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
              {platform.icon}
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
