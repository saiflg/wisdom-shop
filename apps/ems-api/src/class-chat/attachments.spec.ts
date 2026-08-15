import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_BYTES,
  attachmentProblem,
  attachmentReadableWhenMessageIs,
  describeSize,
  dispositionFor,
  extensionFor,
  kindOf,
  safeDisplayName,
} from "./attachments";

describe("the allowlist", () => {
  it("covers what a child actually sends: photos, voice notes and PDFs", () => {
    expect(kindOf("image/jpeg")).toBe("IMAGE");
    expect(kindOf("audio/webm")).toBe("AUDIO");
    expect(kindOf("application/pdf")).toBe("DOCUMENT");
  });

  it("covers the audio formats every browser actually produces", () => {
    // Chrome and Firefox record webm/ogg; Safari records mp4.
    for (const type of ["audio/webm", "audio/ogg", "audio/mp4"]) {
      expect(kindOf(type)).toBe("AUDIO");
    }
  });

  it("refuses everything not named, rather than blocking a list of bad types", () => {
    expect(kindOf("application/x-sh")).toBeNull();
    expect(kindOf("text/html")).toBeNull();
    expect(kindOf("application/octet-stream")).toBeNull();
  });

  it("is case-insensitive, because browsers are inconsistent", () => {
    expect(kindOf("IMAGE/JPEG")).toBe("IMAGE");
  });

  it("derives the extension from the type, never from the uploaded name", () => {
    expect(extensionFor("image/jpeg")).toBe(".jpg");
    expect(extensionFor("application/pdf")).toBe(".pdf");
    expect(extensionFor("application/x-sh")).toBeNull();
  });
});

describe("attachmentProblem", () => {
  it("accepts an ordinary photograph", () => {
    expect(attachmentProblem({ contentType: "image/jpeg", bytes: 900_000 })).toBeNull();
  });

  it("REFUSES SVG, which is XML that can carry a script", () => {
    // Same reason the branding module refuses it. A browser executes it when
    // the file is served inline.
    expect(attachmentProblem({ contentType: "image/svg+xml", bytes: 100 })).toMatch(/contain code/i);
  });

  it("refuses executables and says so plainly", () => {
    expect(attachmentProblem({ contentType: "application/x-msdownload", bytes: 100 })).toMatch(/Programs/i);
  });

  it("refuses archives, because nobody can see what is inside them", () => {
    expect(attachmentProblem({ contentType: "application/zip", bytes: 100 })).toMatch(/Zip files/i);
  });

  it("tells somebody sending a Word file what to do instead", () => {
    // The commonest legitimate refusal. "Unsupported" would leave a child stuck.
    const problem = attachmentProblem({
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: 100,
    });
    expect(problem).toMatch(/PDF instead/i);
  });

  it("refuses anything unknown with a list of what IS allowed", () => {
    const problem = attachmentProblem({ contentType: "application/x-sh", bytes: 100 });
    expect(problem).toMatch(/Photos, voice notes and PDFs/i);
  });

  it("enforces a cap per kind and names the actual size", () => {
    const problem = attachmentProblem({ contentType: "image/png", bytes: MAX_BYTES.IMAGE + 1 });
    expect(problem).toMatch(/The most you can share is/i);
    expect(problem).toMatch(/5\.0 MB/);
  });

  it("allows exactly the cap", () => {
    expect(attachmentProblem({ contentType: "image/png", bytes: MAX_BYTES.IMAGE })).toBeNull();
  });

  it("gives a voice note more room than a photograph", () => {
    // A minute of speech is genuinely bigger than a photo of a page.
    expect(MAX_BYTES.AUDIO).toBeGreaterThan(MAX_BYTES.IMAGE);
    expect(attachmentProblem({ contentType: "audio/webm", bytes: 6 * 1024 * 1024 })).toBeNull();
  });

  it("refuses an empty file", () => {
    expect(attachmentProblem({ contentType: "image/png", bytes: 0 })).toMatch(/empty/i);
  });

  it("ignores charset parameters on the content type", () => {
    expect(attachmentProblem({ contentType: "application/pdf; charset=binary", bytes: 1000 })).toBeNull();
  });

  it("keeps every cap small enough for a phone on school data", () => {
    for (const cap of Object.values(MAX_BYTES)) {
      expect(cap).toBeLessThanOrEqual(10 * 1024 * 1024);
    }
  });
});

describe("safeDisplayName", () => {
  it("keeps a helpful name", () => {
    expect(safeDisplayName("chapter-4-notes.pdf", "application/pdf")).toBe("chapter-4-notes.pdf");
  });

  it("strips any path, so a name can never become a directory", () => {
    expect(safeDisplayName("../../etc/passwd", "image/png")).toBe("passwd");
    expect(safeDisplayName("C:\\Users\\me\\photo.png", "image/png")).toBe("photo.png");
  });

  it("removes the right-to-left override used to disguise an extension", () => {
    // "exe\u202Efdp.pdf" renders as "exepdf.fdp" — an old trick for making a
    // program look like a document.
    const disguised = safeDisplayName("harmless\u202Efdp.exe", "application/pdf");
    expect(disguised).not.toContain("\u202E");
  });

  it("removes control characters", () => {
    expect(safeDisplayName("note\u0000\u001F.pdf", "application/pdf")).toBe("note.pdf");
  });

  it("falls back to a sensible name when nothing usable is left", () => {
    expect(safeDisplayName("", "image/png")).toBe("attachment.png");
    expect(safeDisplayName("///", "application/pdf")).toBe("attachment.pdf");
    expect(safeDisplayName(".hidden", "image/png")).toBe("attachment.png");
  });

  it("truncates a very long name rather than storing it whole", () => {
    expect(safeDisplayName(`${"a".repeat(300)}.pdf`, "application/pdf").length).toBeLessThanOrEqual(80);
  });
});

describe("dispositionFor", () => {
  it("renders images and audio inline, because otherwise they are not shared", () => {
    expect(dispositionFor("IMAGE")).toBe("inline");
    expect(dispositionFor("AUDIO")).toBe("inline");
  });

  it("ALWAYS downloads a PDF rather than framing it", () => {
    // A PDF is a scripting host. Serving one inline from our own origin hands
    // it our cookies.
    expect(dispositionFor("DOCUMENT")).toBe("attachment");
  });
});

describe("attachmentReadableWhenMessageIs", () => {
  it("follows the message it belongs to", () => {
    expect(attachmentReadableWhenMessageIs(true, false)).toBe(true);
    expect(attachmentReadableWhenMessageIs(false, false)).toBe(false);
  });

  it("stops being readable the moment the message is withdrawn", () => {
    // A withdrawn message whose photograph is still fetchable is the bug this
    // exists to prevent.
    expect(attachmentReadableWhenMessageIs(true, true)).toBe(false);
  });
});

describe("describeSize", () => {
  it("reads the way a person would say it", () => {
    expect(describeSize(512)).toBe("512 B");
    expect(describeSize(2048)).toBe("2 KB");
    expect(describeSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("the allowlist as a whole", () => {
  it("contains no type a browser would execute", () => {
    for (const type of Object.keys(ALLOWED_ATTACHMENT_TYPES)) {
      expect(type).not.toMatch(/html|javascript|svg|xml|x-msdownload|zip/);
    }
  });

  it("gives every allowed type an extension", () => {
    for (const [type, entry] of Object.entries(ALLOWED_ATTACHMENT_TYPES)) {
      expect(entry.extension.startsWith(".")).toBe(true);
      expect(kindOf(type)).toBe(entry.kind);
    }
  });
});
