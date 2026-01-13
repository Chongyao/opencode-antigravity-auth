import { describe, expect, it } from "vitest";

import { parseDurationString, parseIsoResetTime, parseRateLimitReason, getBackoffDelayMs } from "./rate-limit";

describe("parseDurationString", () => {
  describe("single unit formats", () => {
    it("parses seconds", () => {
      expect(parseDurationString("30s")).toBe(30000);
    });

    it("parses minutes", () => {
      expect(parseDurationString("2m")).toBe(120000);
    });

    it("parses hours", () => {
      expect(parseDurationString("1h")).toBe(3600000);
    });

    it("parses milliseconds", () => {
      expect(parseDurationString("500ms")).toBe(500);
    });
  });

  describe("combined formats", () => {
    it("parses hours, minutes, seconds", () => {
      expect(parseDurationString("2h1m1s")).toBe(7261000);
    });

    it("parses hours and minutes", () => {
      expect(parseDurationString("1h30m")).toBe(5400000);
    });

    it("parses minutes and seconds", () => {
      expect(parseDurationString("5m30s")).toBe(330000);
    });

    it("parses minutes and milliseconds", () => {
      expect(parseDurationString("1m500ms")).toBe(60500);
    });
  });

  describe("fractional seconds", () => {
    it("parses 1.5s", () => {
      expect(parseDurationString("1.5s")).toBe(1500);
    });

    it("parses 0.5s", () => {
      expect(parseDurationString("0.5s")).toBe(500);
    });

    it("parses 2.25s", () => {
      expect(parseDurationString("2.25s")).toBe(2250);
    });
  });

  describe("edge cases", () => {
    it("returns null for null input", () => {
      expect(parseDurationString(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(parseDurationString(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseDurationString("")).toBeNull();
    });

    it("returns null for invalid format", () => {
      expect(parseDurationString("invalid")).toBeNull();
    });

    it("returns null for plain number", () => {
      expect(parseDurationString("123")).toBeNull();
    });

    it("returns null for negative values", () => {
      expect(parseDurationString("-5s")).toBeNull();
    });
  });
});

describe("parseIsoResetTime", () => {
  describe("valid formats", () => {
    it("parses basic ISO 8601 format", () => {
      const result = parseIsoResetTime("2026-01-08T17:00:00Z");
      expect(result).toBe(Date.parse("2026-01-08T17:00:00Z"));
    });

    it("parses format with milliseconds", () => {
      const result = parseIsoResetTime("2026-01-08T17:00:00.123Z");
      expect(result).toBe(Date.parse("2026-01-08T17:00:00.123Z"));
    });

    it("parses format with positive timezone offset", () => {
      const result = parseIsoResetTime("2026-01-08T17:00:00+08:00");
      expect(result).toBe(Date.parse("2026-01-08T17:00:00+08:00"));
    });

    it("parses format with negative timezone offset", () => {
      const result = parseIsoResetTime("2026-01-08T17:00:00-05:00");
      expect(result).toBe(Date.parse("2026-01-08T17:00:00-05:00"));
    });

    it("parses date without time component", () => {
      const result = parseIsoResetTime("2026-01-08");
      expect(result).toBe(Date.parse("2026-01-08"));
    });
  });

  describe("edge cases", () => {
    it("returns null for null input", () => {
      expect(parseIsoResetTime(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(parseIsoResetTime(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseIsoResetTime("")).toBeNull();
    });

    it("returns null for invalid date string", () => {
      expect(parseIsoResetTime("not-a-date")).toBeNull();
    });

    it("returns null for garbage input", () => {
      expect(parseIsoResetTime("abc123xyz")).toBeNull();
    });
  });
});

describe("parseRateLimitReason", () => {
  describe("from JSON error details", () => {
    it("parses QUOTA_EXHAUSTED", () => {
      const body = JSON.stringify({
        error: {
          details: [{ reason: "QUOTA_EXHAUSTED" }]
        }
      });
      expect(parseRateLimitReason(body)).toBe("QUOTA_EXHAUSTED");
    });

    it("parses RATE_LIMIT_EXCEEDED", () => {
      const body = JSON.stringify({
        error: {
          details: [{ reason: "RATE_LIMIT_EXCEEDED" }]
        }
      });
      expect(parseRateLimitReason(body)).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("parses MODEL_CAPACITY_EXHAUSTED", () => {
      const body = JSON.stringify({
        error: {
          details: [{ reason: "MODEL_CAPACITY_EXHAUSTED" }]
        }
      });
      expect(parseRateLimitReason(body)).toBe("MODEL_CAPACITY_EXHAUSTED");
    });
  });

  describe("from error message", () => {
    it("detects rate limit from message", () => {
      const body = JSON.stringify({
        error: {
          message: "Too many requests per minute"
        }
      });
      expect(parseRateLimitReason(body)).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("detects quota exhaustion from message", () => {
      const body = JSON.stringify({
        error: {
          message: "Quota exhausted for this resource"
        }
      });
      expect(parseRateLimitReason(body)).toBe("QUOTA_EXHAUSTED");
    });
  });

  describe("from plain text", () => {
    it("detects rate limit keywords", () => {
      expect(parseRateLimitReason("too many requests")).toBe("RATE_LIMIT_EXCEEDED");
      expect(parseRateLimitReason("rate limit exceeded")).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("detects quota exhaustion keywords", () => {
      expect(parseRateLimitReason("quota exhausted")).toBe("QUOTA_EXHAUSTED");
      expect(parseRateLimitReason("resource quota limit")).toBe("QUOTA_EXHAUSTED");
    });
  });

  describe("edge cases", () => {
    it("returns UNKNOWN for null", () => {
      expect(parseRateLimitReason(null)).toBe("UNKNOWN");
    });

    it("returns UNKNOWN for undefined", () => {
      expect(parseRateLimitReason(undefined)).toBe("UNKNOWN");
    });

    it("returns UNKNOWN for empty string", () => {
      expect(parseRateLimitReason("")).toBe("UNKNOWN");
    });

    it("returns UNKNOWN for unrecognized text", () => {
      expect(parseRateLimitReason("some random error")).toBe("UNKNOWN");
    });

    it("handles invalid JSON gracefully", () => {
      expect(parseRateLimitReason("{invalid json")).toBe("UNKNOWN");
    });
  });
});

describe("getBackoffDelayMs", () => {
  describe("QUOTA_EXHAUSTED escalation", () => {
    it("returns 60s for first failure", () => {
      expect(getBackoffDelayMs("QUOTA_EXHAUSTED", 1)).toBe(60_000);
    });

    it("returns 5min for second failure", () => {
      expect(getBackoffDelayMs("QUOTA_EXHAUSTED", 2)).toBe(300_000);
    });

    it("returns 30min for third failure", () => {
      expect(getBackoffDelayMs("QUOTA_EXHAUSTED", 3)).toBe(1_800_000);
    });

    it("returns 2h for fourth+ failure", () => {
      expect(getBackoffDelayMs("QUOTA_EXHAUSTED", 4)).toBe(7_200_000);
      expect(getBackoffDelayMs("QUOTA_EXHAUSTED", 10)).toBe(7_200_000);
    });
  });

  describe("fixed delays for other reasons", () => {
    it("returns 30s for RATE_LIMIT_EXCEEDED", () => {
      expect(getBackoffDelayMs("RATE_LIMIT_EXCEEDED", 1)).toBe(30_000);
      expect(getBackoffDelayMs("RATE_LIMIT_EXCEEDED", 5)).toBe(30_000);
    });

    it("returns 15s for MODEL_CAPACITY_EXHAUSTED", () => {
      expect(getBackoffDelayMs("MODEL_CAPACITY_EXHAUSTED", 1)).toBe(15_000);
      expect(getBackoffDelayMs("MODEL_CAPACITY_EXHAUSTED", 3)).toBe(15_000);
    });

    it("returns 20s for SERVER_ERROR", () => {
      expect(getBackoffDelayMs("SERVER_ERROR", 1)).toBe(20_000);
    });

    it("returns 60s for UNKNOWN", () => {
      expect(getBackoffDelayMs("UNKNOWN", 1)).toBe(60_000);
    });
  });

  describe("edge cases", () => {
    it("handles zero failureCount", () => {
      expect(getBackoffDelayMs("QUOTA_EXHAUSTED", 0)).toBe(60_000);
    });

    it("handles negative failureCount", () => {
      expect(getBackoffDelayMs("QUOTA_EXHAUSTED", -1)).toBe(60_000);
    });
  });
});
