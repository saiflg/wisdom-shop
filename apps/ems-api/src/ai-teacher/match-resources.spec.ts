import { isSafeResourceUrl, matchResources, toEmbedUrl, type StoredResource } from "./match-resources";

function resource(over: Partial<StoredResource> = {}): StoredResource {
  return {
    id: "r1",
    kind: "VIDEO",
    title: "Adding fractions demonstration",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    keywords: null,
    ...over,
  };
}

describe("isSafeResourceUrl", () => {
  it("accepts http and https", () => {
    expect(isSafeResourceUrl("https://example.com/video")).toBe(true);
    expect(isSafeResourceUrl("http://intranet.school.local/demo")).toBe(true);
  });

  it("refuses script and data URLs outright", () => {
    expect(isSafeResourceUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeResourceUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeResourceUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("refuses schemes that reach outside the browser", () => {
    expect(isSafeResourceUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeResourceUrl("ftp://example.com/x")).toBe(false);
  });

  it("refuses anything that is not a URL", () => {
    expect(isSafeResourceUrl("")).toBe(false);
    expect(isSafeResourceUrl("   ")).toBe(false);
    expect(isSafeResourceUrl("not a url")).toBe(false);
    expect(isSafeResourceUrl("//example.com/x")).toBe(false);
  });
});

describe("toEmbedUrl", () => {
  it("embeds a YouTube watch link without the tracking cookie domain", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("embeds a youtu.be short link", () => {
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("embeds a Vimeo link", () => {
    expect(toEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
  });

  it("refuses to frame any other host", () => {
    // The link still works; it is simply not given a frame inside the portal.
    expect(toEmbedUrl("https://example.com/some-video.mp4")).toBeNull();
    expect(toEmbedUrl("https://khanacademy.org/lesson")).toBeNull();
  });

  it("is not fooled by a lookalike host", () => {
    expect(toEmbedUrl("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(toEmbedUrl("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("refuses a video id that is not a bare id", () => {
    // Anything else here is carried straight into the embed URL.
    expect(toEmbedUrl("https://www.youtube.com/watch?v=../../evil")).toBeNull();
    expect(toEmbedUrl("https://www.youtube.com/watch?v=")).toBeNull();
    expect(toEmbedUrl("https://www.youtube.com/watch")).toBeNull();
    expect(toEmbedUrl("https://vimeo.com/not-a-number")).toBeNull();
  });

  it("refuses an unsafe scheme even on an allowed host", () => {
    expect(toEmbedUrl("javascript:void(0)//youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("matchResources", () => {
  it("offers a demonstration whose words overlap the lesson", () => {
    const matched = matchResources([resource()], "Adding fractions with unlike denominators");
    expect(matched).toHaveLength(1);
    expect(matched[0].embedUrl).toContain("youtube-nocookie");
  });

  it("offers nothing when nothing is relevant, rather than padding the lesson", () => {
    expect(matchResources([resource({ title: "Photosynthesis explained" })], "Adding fractions")).toEqual([]);
  });

  it("matches on keywords as well as the title", () => {
    const matched = matchResources(
      [resource({ title: "Pizza slices", keywords: "fractions denominators halves" })],
      "Adding fractions",
    );
    expect(matched).toHaveLength(1);
  });

  it("ignores common words, which would otherwise match everything", () => {
    const matched = matchResources(
      [resource({ title: "An introduction to the lesson", keywords: null })],
      "An introduction to the lesson on photosynthesis",
    );
    expect(matched).toEqual([]);
  });

  it("puts the closest match first", () => {
    const matched = matchResources(
      [
        resource({ id: "loose", title: "Fractions overview" }),
        resource({ id: "close", title: "Adding fractions denominators" }),
      ],
      "Adding fractions denominators",
    );
    expect(matched[0].id).toBe("close");
  });

  it("keeps the school's own order when two match equally well", () => {
    const matched = matchResources(
      [resource({ id: "first", title: "Fractions" }), resource({ id: "second", title: "Fractions" })],
      "Fractions",
    );
    expect(matched.map((m) => m.id)).toEqual(["first", "second"]);
  });

  it("caps how many are offered, so a lesson does not become a playlist", () => {
    const many = Array.from({ length: 10 }, (_, i) => resource({ id: `r${i}`, title: "Fractions demo" }));
    expect(matchResources(many, "Fractions")).toHaveLength(3);
  });

  it("drops a stored resource whose URL is unsafe", () => {
    const matched = matchResources([resource({ url: "javascript:alert(1)" })], "Adding fractions");
    expect(matched).toEqual([]);
  });

  it("still offers a non-embeddable resource, as a link", () => {
    const matched = matchResources([resource({ url: "https://example.com/fractions.pdf" })], "Adding fractions");
    expect(matched).toHaveLength(1);
    expect(matched[0].embedUrl).toBeNull();
  });

  it("handles an empty library", () => {
    expect(matchResources([], "Anything")).toEqual([]);
  });
});
