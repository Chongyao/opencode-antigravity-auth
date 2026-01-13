import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QuotaWarmer, createNoOpWarmupCallback, type WarmupCallback } from "./warming";
import type { ManagedAccount, QuotaKey, ModelFamily } from "./accounts";
import type { QuotaWarmingConfig } from "./config/schema";

function createMockAccount(overrides: Partial<ManagedAccount> = {}): ManagedAccount {
  return {
    index: 0,
    addedAt: Date.now(),
    lastUsed: Date.now(),
    parts: { refreshToken: "test-token" },
    rateLimitResetTimes: {},
    touchedForQuota: {},
    ...overrides,
  };
}

function createMockAccountManager(accounts: ManagedAccount[] = []) {
  return {
    getAccounts: vi.fn(() => accounts),
    getAccountCount: vi.fn(() => accounts.length),
    toAuthDetails: vi.fn((account: ManagedAccount) => ({
      type: "oauth" as const,
      refresh: account.parts.refreshToken,
      access: account.access,
      expires: account.expires,
    })),
    updateFromAuth: vi.fn(),
  };
}

function createMockConfig(overrides: Partial<QuotaWarmingConfig> = {}): QuotaWarmingConfig {
  return {
    enabled: true,
    interval_minutes: 30,
    probe_before_minutes: 5,
    ...overrides,
  };
}

describe("QuotaWarmer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("creates instance with valid config", () => {
      const accountManager = createMockAccountManager();
      const config = createMockConfig();
      const callback = createNoOpWarmupCallback();
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      expect(warmer.isRunning()).toBe(false);
    });
  });

  describe("start/stop", () => {
    it("starts and stops the warming loop", () => {
      const accountManager = createMockAccountManager();
      const config = createMockConfig();
      const callback = createNoOpWarmupCallback();
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      
      warmer.start();
      expect(warmer.isRunning()).toBe(true);
      
      warmer.stop();
      expect(warmer.isRunning()).toBe(false);
    });

    it("does not start if disabled in config", () => {
      const accountManager = createMockAccountManager();
      const config = createMockConfig({ enabled: false });
      const callback = createNoOpWarmupCallback();
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      
      warmer.start();
      expect(warmer.isRunning()).toBe(false);
    });

    it("warns if start is called twice", () => {
      const accountManager = createMockAccountManager();
      const config = createMockConfig();
      const callback = createNoOpWarmupCallback();
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      
      warmer.start();
      warmer.start();
      expect(warmer.isRunning()).toBe(true);
      
      warmer.stop();
    });
  });

  describe("checkAndWarm", () => {
    it("returns empty array when no accounts have rate limits", async () => {
      const accounts = [createMockAccount()];
      const accountManager = createMockAccountManager(accounts);
      const config = createMockConfig();
      const callback = createNoOpWarmupCallback();
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      const results = await warmer.checkAndWarm();
      
      expect(results).toEqual([]);
    });

    it("returns empty array when rate limit has already passed", async () => {
      const now = Date.now();
      const accounts = [createMockAccount({
        rateLimitResetTimes: {
          "claude": now - 60000,
        },
      })];
      const accountManager = createMockAccountManager(accounts);
      const config = createMockConfig();
      const callback = createNoOpWarmupCallback();
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      const results = await warmer.checkAndWarm();
      
      expect(results).toEqual([]);
    });

    it("returns empty array when rate limit is too far in future", async () => {
      const now = Date.now();
      const accounts = [createMockAccount({
        rateLimitResetTimes: {
          "claude": now + 10 * 60 * 1000,
        },
      })];
      const accountManager = createMockAccountManager(accounts);
      const config = createMockConfig({ probe_before_minutes: 5 });
      const callback = createNoOpWarmupCallback();
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      const results = await warmer.checkAndWarm();
      
      expect(results).toEqual([]);
    });

    it("warms account when quota reset is within probe window", async () => {
      const now = Date.now();
      const accounts = [createMockAccount({
        index: 0,
        email: "test@example.com",
        rateLimitResetTimes: {
          "claude": now + 3 * 60 * 1000,
        },
      })];
      const accountManager = createMockAccountManager(accounts);
      const config = createMockConfig({ probe_before_minutes: 5 });
      const callback = vi.fn().mockResolvedValue(true);
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      const results = await warmer.checkAndWarm();
      
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result).toBeDefined();
      expect(result!.accountIndex).toBe(0);
      expect(result!.email).toBe("test@example.com");
      expect(result!.quotaKey).toBe("claude");
      expect(result!.success).toBe(true);
      expect(callback).toHaveBeenCalledWith(
        accounts[0],
        "claude",
        "claude"
      );
    });

    it("warms gemini accounts correctly", async () => {
      const now = Date.now();
      const accounts = [createMockAccount({
        index: 1,
        email: "gemini@example.com",
        rateLimitResetTimes: {
          "gemini-antigravity": now + 2 * 60 * 1000,
        },
      })];
      const accountManager = createMockAccountManager(accounts);
      const config = createMockConfig({ probe_before_minutes: 5 });
      const callback = vi.fn().mockResolvedValue(true);
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      const results = await warmer.checkAndWarm();
      
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result).toBeDefined();
      expect(result!.accountIndex).toBe(1);
      expect(result!.email).toBe("gemini@example.com");
      expect(result!.quotaKey).toBe("gemini-antigravity");
      expect(result!.success).toBe(true);
      expect(callback).toHaveBeenCalledWith(
        accounts[0],
        "gemini",
        "gemini-antigravity"
      );
    });

    it("handles warmup failure gracefully", async () => {
      const now = Date.now();
      const accounts = [createMockAccount({
        rateLimitResetTimes: {
          "claude": now + 3 * 60 * 1000,
        },
      })];
      const accountManager = createMockAccountManager(accounts);
      const config = createMockConfig({ probe_before_minutes: 5 });
      const callback = vi.fn().mockRejectedValue(new Error("Network error"));
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      const results = await warmer.checkAndWarm();
      
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
      expect(result!.error).toBe("Network error");
    });

    it("does not warm same quota twice within probe window", async () => {
      const now = Date.now();
      const accounts = [createMockAccount({
        rateLimitResetTimes: {
          "claude": now + 3 * 60 * 1000,
        },
      })];
      const accountManager = createMockAccountManager(accounts);
      const config = createMockConfig({ probe_before_minutes: 5 });
      const callback = vi.fn().mockResolvedValue(true);
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      
      const results1 = await warmer.checkAndWarm();
      expect(results1).toHaveLength(1);
      expect(callback).toHaveBeenCalledTimes(1);
      
      const results2 = await warmer.checkAndWarm();
      expect(results2).toHaveLength(0);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("warms multiple accounts with upcoming resets", async () => {
      const now = Date.now();
      const accounts = [
        createMockAccount({
          index: 0,
          email: "user1@example.com",
          rateLimitResetTimes: {
            "claude": now + 2 * 60 * 1000,
          },
        }),
        createMockAccount({
          index: 1,
          email: "user2@example.com",
          rateLimitResetTimes: {
            "gemini-cli": now + 4 * 60 * 1000,
          },
        }),
      ];
      const accountManager = createMockAccountManager(accounts);
      const config = createMockConfig({ probe_before_minutes: 5 });
      const callback = vi.fn().mockResolvedValue(true);
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      const results = await warmer.checkAndWarm();
      
      expect(results).toHaveLength(2);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe("createNoOpWarmupCallback", () => {
    it("returns a callback that always succeeds", async () => {
      const callback = createNoOpWarmupCallback();
      const result = await callback(
        createMockAccount(),
        "claude",
        "claude"
      );
      expect(result).toBe(true);
    });
  });

  describe("interval execution", () => {
    it("runs checkAndWarm on start", async () => {
      const now = Date.now();
      const account = createMockAccount({
        rateLimitResetTimes: {
          "claude": now + 3 * 60 * 1000,
        },
      });
      const accounts = [account];
      const accountManager = createMockAccountManager(accounts);
      const config = createMockConfig({ 
        interval_minutes: 1,
        probe_before_minutes: 5,
      });
      const callback = vi.fn().mockResolvedValue(true);
      
      const warmer = new QuotaWarmer(accountManager as any, config, callback);
      warmer.start();
      
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
      
      expect(callback).toHaveBeenCalledTimes(1);
      
      warmer.stop();
    });
  });
});
