import { describe, expect, it } from "vitest";

import { parseDurationString, parseIsoResetTime } from "./rate-limit";

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
