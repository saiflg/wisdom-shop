import { canJoin, forDisplay, stateOf, validateMeetingUrl, validateTimes } from "./meeting-rules";

const at = (iso: string) => new Date(`2026-09-10T${iso}:00Z`);
const NOW = at("10:00");

const meeting = (start: string, end: string, cancelled = false) => ({
  startsAt: at(start),
  endsAt: at(end),
  cancelledAt: cancelled ? at("09:00") : null,
});

describe("validateMeetingUrl", () => {
  it("accepts the meeting hosts schools actually use", () => {
    expect(validateMeetingUrl("https://zoom.us/j/123456")).toBeNull();
    expect(validateMeetingUrl("https://us02web.zoom.us/j/123")).toBeNull();
    expect(validateMeetingUrl("https://meet.google.com/abc-defg-hij")).toBeNull();
    expect(validateMeetingUrl("https://teams.microsoft.com/l/meetup-join/x")).toBeNull();
  });

  // The reason this is an allow-list.
  it("refuses an arbitrary address, however well formed", () => {
    // This link is given to children and they will click it. "Looks like a
    // URL" is not a good enough standard — an arbitrary address put in front
    // of a class by anybody who can edit a lesson is the shape of a phishing
    // link.
    expect(validateMeetingUrl("https://free-prizes.example/join")).toMatch(/^Links have to be from/);
  });

  it("refuses a host that merely contains an allowed one", () => {
    // zoom.us.evil.example must not pass by ending up inside a substring
    // check. It is compared as a host and a suffix after a dot.
    expect(validateMeetingUrl("https://zoom.us.evil.example/j/1")).toMatch(/^Links have to be from/);
  });

  it("refuses plaintext http", () => {
    // A meeting link anybody on the network can read on the way past.
    expect(validateMeetingUrl("http://zoom.us/j/123")).toBe("The link has to start with https");
  });

  it("refuses something that is not a link at all", () => {
    expect(validateMeetingUrl("ask the teacher")).toBe("That is not a link");
    expect(validateMeetingUrl("   ")).toBe("A live lesson needs a link");
  });
});

describe("validateTimes", () => {
  it("accepts an ordinary lesson", () => {
    expect(validateTimes(at("09:00"), at("10:00"))).toBeNull();
  });

  it("refuses one that ends before it starts", () => {
    expect(validateTimes(at("10:00"), at("09:00"))).toBe("A lesson cannot end before it starts");
  });

  it("refuses a zero-length lesson", () => {
    expect(validateTimes(at("10:00"), at("10:00"))).toBe("A lesson cannot end before it starts");
  });

  it("refuses something longer than a school day", () => {
    // Almost always a date typed wrong, and it would sit "live" for days.
    expect(validateTimes(new Date("2026-09-10T08:00:00Z"), new Date("2026-09-11T08:00:00Z"))).toBe(
      "That is longer than a school day",
    );
  });
});

describe("stateOf", () => {
  it("knows what is live", () => {
    expect(stateOf(meeting("09:30", "10:30"), NOW)).toBe("LIVE");
  });

  it("knows what is over", () => {
    expect(stateOf(meeting("08:00", "09:00"), NOW)).toBe("FINISHED");
  });

  // Why SOON exists.
  it("opens fifteen minutes early", () => {
    // A link that appears exactly on the hour is a link half the class
    // misses.
    expect(stateOf(meeting("10:10", "11:00"), NOW)).toBe("SOON");
    expect(stateOf(meeting("10:16", "11:00"), NOW)).toBe("SCHEDULED");
  });

  it("does not make tomorrow look joinable today", () => {
    expect(stateOf(meeting("14:00", "15:00"), NOW)).toBe("SCHEDULED");
  });

  it("reports a cancelled lesson as cancelled even while it would be live", () => {
    expect(stateOf(meeting("09:30", "10:30", true), NOW)).toBe("CANCELLED");
  });
});

describe("canJoin", () => {
  it("lets somebody in when it is live or about to be", () => {
    expect(canJoin(meeting("09:30", "10:30"), NOW)).toBe(true);
    expect(canJoin(meeting("10:10", "11:00"), NOW)).toBe(true);
  });

  it("does not let somebody into what is finished, cancelled or far off", () => {
    expect(canJoin(meeting("08:00", "09:00"), NOW)).toBe(false);
    expect(canJoin(meeting("09:30", "10:30", true), NOW)).toBe(false);
    expect(canJoin(meeting("14:00", "15:00"), NOW)).toBe(false);
  });
});

describe("forDisplay", () => {
  it("puts what is happening now first", () => {
    // Sorting strictly by time would bury a live lesson under everything
    // scheduled earlier in the day.
    const meetings = [
      meeting("08:00", "09:00"), // finished
      meeting("14:00", "15:00"), // later
      meeting("09:30", "10:30"), // live
      meeting("10:10", "11:00"), // soon
    ];
    expect(forDisplay(meetings, NOW).map((m) => stateOf(m, NOW))).toEqual([
      "LIVE",
      "SOON",
      "SCHEDULED",
      "FINISHED",
    ]);
  });

  it("orders within a state by start time", () => {
    const meetings = [meeting("16:00", "17:00"), meeting("14:00", "15:00")];
    expect(forDisplay(meetings, NOW)[0]?.startsAt).toEqual(at("14:00"));
  });

  it("does not modify what it was given", () => {
    const meetings = [meeting("14:00", "15:00"), meeting("09:30", "10:30")];
    forDisplay(meetings, NOW);
    expect(meetings[0]?.startsAt).toEqual(at("14:00"));
  });
});
