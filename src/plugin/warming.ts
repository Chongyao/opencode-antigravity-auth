/**
 * Quota Warming Module
 * 
 * Proactively sends lightweight "ping" requests to accounts whose quotas are about
 * to reset. This ensures tokens are refreshed and the account is ready for immediate
 * use when the quota becomes available again.
 * 
 * The warming logic:
 * 1. Runs periodically (every `interval_minutes`)
 * 2. Scans all accounts for rate limit reset times
 * 3. For each quota that will reset within `probe_before_minutes`:
 *    - Sends a minimal warmup request to that account/quota
 *    - This refreshes tokens and verifies the account is healthy
 */

import type { AccountManager, ManagedAccount, ModelFamily, QuotaKey } from "./accounts";
import type { QuotaWarmingConfig } from "./config/schema";
import { createLogger } from "./logger";

const log = createLogger("warming");

/**
 * Callback function type for performing the actual warmup request.
 * This is injected by the plugin to allow sending requests through
 * the normal request pipeline.
 */
export type WarmupCallback = (
  account: ManagedAccount,
  family: ModelFamily,
  quotaKey: QuotaKey,
) => Promise<boolean>;

/**
 * Result of a single warmup attempt.
 */
export interface WarmupResult {
  accountIndex: number;
  email?: string;
  quotaKey: QuotaKey;
  success: boolean;
  error?: string;
}

/**
 * Manages proactive quota warming for Antigravity accounts.
 * 
 * When enabled, periodically checks for accounts whose quotas are about to reset
 * and sends lightweight warmup requests to ensure they're ready for immediate use.
 */
export class QuotaWarmer {
  private accountManager: AccountManager;
  private config: QuotaWarmingConfig;
  private performWarmup: WarmupCallback;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private warmedQuotas = new Map<string, number>();

  constructor(
    accountManager: AccountManager,
    config: QuotaWarmingConfig,
    performWarmup: WarmupCallback,
  ) {
    this.accountManager = accountManager;
    this.config = config;
    this.performWarmup = performWarmup;
  }

  /**
   * Start the quota warming background loop.
   */
  start(): void {
    if (this.running) {
      log.warn("QuotaWarmer already running");
      return;
    }

    if (!this.config.enabled) {
      log.info("Quota warming disabled by configuration");
      return;
    }

    const intervalMs = this.config.interval_minutes * 60 * 1000;
    log.info("Starting quota warmer", {
      intervalMinutes: this.config.interval_minutes,
      probeBeforeMinutes: this.config.probe_before_minutes,
    });

    this.running = true;

    this.loop().catch((err) => {
      log.error("Quota warming loop error", { error: String(err) });
    });

    this.intervalId = setInterval(() => {
      this.loop().catch((err) => {
        log.error("Quota warming loop error", { error: String(err) });
      });
    }, intervalMs);
  }

  /**
   * Stop the quota warming background loop.
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    log.info("Stopping quota warmer");
    this.running = false;

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.warmedQuotas.clear();
  }

  /**
   * Check if the warmer is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Main warming loop - scans accounts and warms those with upcoming resets.
   */
  private async loop(): Promise<void> {
    if (!this.running) {
      return;
    }

    const results = await this.checkAndWarm();
    
    if (results.length > 0) {
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      log.info("Quota warming cycle complete", { successful, failed, total: results.length });
    }
  }

  /**
   * Scan all accounts and warm those with quotas resetting soon.
   * 
   * @returns Array of warmup results
   */
  async checkAndWarm(): Promise<WarmupResult[]> {
    const now = Date.now();
    const probeWindowMs = this.config.probe_before_minutes * 60 * 1000;
    const results: WarmupResult[] = [];

    const accounts = this.accountManager.getAccounts();
    
    for (const account of accounts) {
      const quotaKeys = Object.keys(account.rateLimitResetTimes) as QuotaKey[];
      
      for (const quotaKey of quotaKeys) {
        const resetTime = account.rateLimitResetTimes[quotaKey];
        if (resetTime === undefined) {
          continue;
        }

        const timeUntilReset = resetTime - now;
        if (timeUntilReset <= 0) {
          continue;
        }

        if (timeUntilReset > probeWindowMs) {
          continue;
        }

        const warmKey = `${account.index}:${quotaKey}`;
        const lastWarmed = this.warmedQuotas.get(warmKey);
        if (lastWarmed !== undefined && now - lastWarmed < probeWindowMs) {
          continue;
        }

        const family = this.getModelFamilyFromQuotaKey(quotaKey);
        
        log.info("Warming account for upcoming quota reset", {
          accountIndex: account.index,
          email: account.email,
          quotaKey,
          resetTime: new Date(resetTime).toISOString(),
          timeUntilResetMs: timeUntilReset,
        });

        const result = await this.warmAccount(account, family, quotaKey);
        results.push(result);

        this.warmedQuotas.set(warmKey, now);
      }
    }

    this.cleanupWarmedQuotas(now);

    return results;
  }

  /**
   * Send a warmup request to a specific account for a specific quota.
   */
  private async warmAccount(
    account: ManagedAccount,
    family: ModelFamily,
    quotaKey: QuotaKey,
  ): Promise<WarmupResult> {
    try {
      const success = await this.performWarmup(account, family, quotaKey);
      return {
        accountIndex: account.index,
        email: account.email,
        quotaKey,
        success,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error("Warmup failed", {
        accountIndex: account.index,
        email: account.email,
        quotaKey,
        error: errorMessage,
      });
      return {
        accountIndex: account.index,
        email: account.email,
        quotaKey,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Extract model family from quota key.
   */
  private getModelFamilyFromQuotaKey(quotaKey: QuotaKey): ModelFamily {
    if (quotaKey === "claude" || quotaKey.startsWith("claude:")) {
      return "claude";
    }
    return "gemini";
  }

  /**
   * Remove old entries from the warmed quotas tracking map.
   */
  private cleanupWarmedQuotas(now: number): void {
    const maxAge = this.config.probe_before_minutes * 60 * 1000 * 2;
    
    for (const [key, timestamp] of this.warmedQuotas.entries()) {
      if (now - timestamp > maxAge) {
        this.warmedQuotas.delete(key);
      }
    }
  }
}

/**
 * Create a no-op warmup callback for testing.
 */
export function createNoOpWarmupCallback(): WarmupCallback {
  return async () => true;
}
