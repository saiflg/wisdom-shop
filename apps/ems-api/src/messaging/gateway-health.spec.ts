import { channelHealth, explainFailure, gatewayHealth, type MessageOutcome } from "./gateway-health";

const sent = (channel: "EMAIL" | "SMS" = "EMAIL"): MessageOutcome => ({ channel, status: "SENT", statusReason: null });
const failed = (reason: string, channel: "EMAIL" | "SMS" = "EMAIL"): MessageOutcome => ({
  channel,
  status: "FAILED",
  statusReason: reason,
});

const BOTH = { email: true, sms: true };

describe("explainFailure", () => {
  it("turns the exact error this school is hitting into something actionable", () => {
    // Verbatim from the demo school's outbox.
    expect(explainFailure("Invalid login: 535 5.7.0 Invalid credentials")).toMatch(/username or password/i);
  });

  it("recognises being rate-limited for repeated bad logins, and says to wait", () => {
    expect(explainFailure("Invalid login: 535 5.7.0 Too many failed login attempts")).toMatch(/wait a few minutes/i);
  });

  it("distinguishes a wrong host from a wrong port", () => {
    expect(explainFailure("getaddrinfo ENOTFOUND smtp.wrong.io")).toMatch(/address cannot be found/i);
    expect(explainFailure("connect ECONNREFUSED 1.2.3.4:587")).toMatch(/Nothing is answering/i);
  });

  it("recognises a certificate problem", () => {
    expect(explainFailure("self signed certificate in certificate chain")).toMatch(/certificate/i);
  });

  it("says nothing it does not understand, rather than guessing", () => {
    // A wrong explanation is worse than none: it sends somebody to the wrong
    // screen with confidence.
    expect(explainFailure("something nobody has seen before")).toBeNull();
    expect(explainFailure(null)).toBeNull();
  });

  it("does not treat 'no gateway' as an error to explain", () => {
    expect(explainFailure("[no email gateway]")).toBeNull();
  });
});

describe("channelHealth", () => {
  it("is healthy when everything went out", () => {
    const health = channelHealth("EMAIL", [sent(), sent()], true);
    expect(health.health).toBe("HEALTHY");
    expect(health.action).toBeNull();
  });

  it("is BROKEN when nothing is getting through", () => {
    const health = channelHealth("EMAIL", [failed("Invalid login: 535"), failed("Invalid login: 535")], true);
    expect(health.health).toBe("BROKEN");
    expect(health.headline).toMatch(/No emails are getting through/i);
    expect(health.action).toMatch(/username or password/i);
  });

  it("is DEGRADED when only some fail, which is a different problem", () => {
    // Some failing is usually bad addresses; all failing is a broken gateway.
    // Reporting them the same way sends somebody to the wrong screen.
    const health = channelHealth("EMAIL", [sent(), sent(), failed("Mailbox not found")], true);
    expect(health.health).toBe("DEGRADED");
    expect(health.headline).toBe("1 of the last 3 emails failed");
  });

  it("reports NOT_SET_UP without treating it as a problem", () => {
    // Plenty of schools never configure SMS. Shouting daily would train
    // everyone to ignore the banner that matters.
    const health = channelHealth("SMS", [], false);
    expect(health.health).toBe("NOT_SET_UP");
    expect(health.action).toBeNull();
  });

  it("is IDLE when configured but nothing has been sent", () => {
    expect(channelHealth("EMAIL", [], true).health).toBe("IDLE");
  });

  it("looks only at its own channel", () => {
    const outcomes = [sent("EMAIL"), failed("boom", "SMS")];
    expect(channelHealth("EMAIL", outcomes, true).health).toBe("HEALTHY");
    expect(channelHealth("SMS", outcomes, true).health).toBe("BROKEN");
  });

  it("reports the commonest failure, not the most recent", () => {
    const outcomes = [failed("Invalid login: 535"), failed("Invalid login: 535"), failed("Mailbox full")];
    expect(channelHealth("EMAIL", outcomes, true).topReason).toBe("Invalid login: 535");
  });

  it("still gives an action when the reason is not one it recognises", () => {
    const health = channelHealth("EMAIL", [failed("mysterious")], true);
    expect(health.action).toMatch(/Settings . Communication/);
  });
});

describe("gatewayHealth", () => {
  it("raises no banner when everything is fine", () => {
    const health = gatewayHealth([sent(), sent()], { email: true, sms: false });
    expect(health.needsAttention).toBe(false);
    expect(health.banner).toBeNull();
  });

  it("raises no banner for a channel simply not set up", () => {
    const health = gatewayHealth([], { email: false, sms: false });
    expect(health.needsAttention).toBe(false);
  });

  it("raises a banner naming the cause when a gateway is broken", () => {
    const health = gatewayHealth([failed("Invalid login: 535 5.7.0 Invalid credentials")], BOTH);
    expect(health.needsAttention).toBe(true);
    expect(health.banner).toMatch(/No emails are getting through/);
    expect(health.banner).toMatch(/username or password/i);
  });

  it("mentions both channels when both are broken", () => {
    const health = gatewayHealth([failed("Invalid login", "EMAIL"), failed("Invalid login", "SMS")], BOTH);
    expect(health.banner).toMatch(/email/i);
    expect(health.banner).toMatch(/text message/i);
  });

  it("always reports every channel, so a screen can show the detail", () => {
    expect(gatewayHealth([], { email: true, sms: true }).channels).toHaveLength(2);
  });
});
