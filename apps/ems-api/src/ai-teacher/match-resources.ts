/**
 * Demonstrations a person made, offered to a student mid-class.
 *
 * Two rules shape this file, and both are about who chose the link.
 *
 * 1. **Staff add these; the AI never does.** A model asked for "a good video
 *    about fractions" will invent a plausible URL without hesitation, and the
 *    failure mode is a child sent somewhere nobody vetted. So the school
 *    curates, and the class only decides which of the school's own
 *    demonstrations fits the lesson in front of it.
 * 2. **Only well-known video hosts are embedded.** Everything else is shown
 *    as a link the student clicks knowingly. Dropping an arbitrary origin
 *    into an iframe inside a school portal hands that origin a frame in a
 *    child's session.
 */

export interface StoredResource {
  id: string;
  kind: "VIDEO" | "DOCUMENT" | "LINK";
  title: string;
  url: string;
  keywords: string | null;
}

export interface OfferedResource extends StoredResource {
  /** An embeddable player URL, or null when the student should follow a link instead. */
  embedUrl: string | null;
}

/** Hosts whose embed endpoints are well defined and widely used in schools. */
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

/** Words too common to tell one lesson from another. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "how",
  "what",
  "why",
  "is",
  "are",
  "it",
  "its",
  "using",
  "into",
  "from",
  "lesson",
  "introduction",
  "intro",
  "basics",
]);

/**
 * Whether a stored URL is safe to hand a browser at all.
 *
 * `javascript:` and `data:` are the obvious ones; anything that is not plain
 * http(s) is refused rather than reasoned about.
 */
export function isSafeResourceUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  // http as well as https, because a school's own intranet demonstration
  // server is a real thing; the browser will complain about mixed content
  // and that is the right place for that conversation.
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/**
 * Turns a watch URL into its embed form, or returns null if this host is not
 * one we are willing to put in a frame.
 */
export function toEmbedUrl(url: string): string | null {
  if (!isSafeResourceUrl(url)) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const id = host === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
    // Only a bare video id. A path or a query smuggled in here would be
    // carried straight into the embed URL.
    if (!id || !/^[A-Za-z0-9_-]{5,20}$/.test(id)) return null;
    return `https://www.youtube-nocookie.com/embed/${id}`;
  }

  if (VIMEO_HOSTS.has(host)) {
    const id = parsed.pathname.split("/").filter(Boolean).pop();
    if (!id || !/^\d{5,15}$/.test(id)) return null;
    return `https://player.vimeo.com/video/${id}`;
  }

  return null;
}

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Picks the school's demonstrations that suit the lesson about to be taught.
 *
 * Loose word overlap rather than anything clever: the alternative is a
 * teacher having to attach a video to every generated lesson individually,
 * and the lessons are generated, so there is nothing stable to attach to.
 * Ordering is by how well each matches, and ties keep the order the school
 * added them.
 */
export function matchResources(
  resources: StoredResource[],
  lessonTitle: string,
  limit = 3,
): OfferedResource[] {
  const wanted = new Set(tokenise(lessonTitle));

  const scored = resources
    .filter((resource) => isSafeResourceUrl(resource.url))
    .map((resource, index) => {
      const haystack = new Set(tokenise(`${resource.title} ${resource.keywords ?? ""}`));
      let score = 0;
      for (const word of wanted) if (haystack.has(word)) score += 1;
      return { resource, score, index };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);

  return scored.map(({ resource }) => ({ ...resource, embedUrl: toEmbedUrl(resource.url) }));
}
