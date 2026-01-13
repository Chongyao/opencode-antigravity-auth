#!/usr/bin/env bun

import { AccountManager } from "../src/plugin/accounts";
import { QuotaWarmer, createNoOpWarmupCallback } from "../src/plugin/warming";
import type { QuotaWarmingConfig } from "../src/plugin/config/schema";
import type { AccountStorageV3 } from "../src/plugin/storage";

const now = Date.now();
const fiveMinutesLater = now + 5 * 60 * 1000;

const mockStorage: AccountStorageV3 = {
  version: 3,
  accounts: [
    {
      email: "test1@example.com",
      refreshToken: "mock-token-1",
      addedAt: now,
      lastUsed: now,
      rateLimitResetTimes: {
        "claude": fiveMinutesLater,
        "gemini-antigravity": fiveMinutesLater + 60000,
      },
    },
    {
      email: "test2@example.com",
      refreshToken: "mock-token-2",
      addedAt: now,
      lastUsed: now,
      rateLimitResetTimes: {
        "gemini-cli": fiveMinutesLater + 2 * 60 * 1000,
      },
    },
  ],
  activeIndex: 0,
  activeIndexByFamily: {
    claude: 0,
    gemini: 0,
  },
};

const accountManager = new AccountManager(undefined, mockStorage);

const config: QuotaWarmingConfig = {
  enabled: true,
  interval_minutes: 1,
  probe_before_minutes: 10,
};

let warmupCallCount = 0;
const warmupCallback = async (account: any, family: any, quotaKey: any) => {
  warmupCallCount++;
  console.log(`\n🔥 Warmup triggered:`);
  console.log(`   Account: ${account.email}`);
  console.log(`   Family: ${family}`);
  console.log(`   Quota: ${quotaKey}`);
  console.log(`   Reset time: ${new Date(account.rateLimitResetTimes[quotaKey]).toLocaleString()}`);
  return true;
};

const warmer = new QuotaWarmer(accountManager as any, config, warmupCallback);

console.log("🚀 Testing QuotaWarmer with mock data:\n");
console.log("📊 Mock accounts:");
mockStorage.accounts.forEach((acc, i) => {
  console.log(`\n  Account ${i + 1}: ${acc.email}`);
  Object.entries(acc.rateLimitResetTimes || {}).forEach(([key, time]) => {
    if (time !== undefined) {
      const minutesUntilReset = Math.round((time - now) / 60000);
      console.log(`    - ${key}: resets in ${minutesUntilReset} minutes`);
    }
  });
});

console.log("\n\n⏱️  Running checkAndWarm()...\n");

const results = await warmer.checkAndWarm();

console.log("\n\n📈 Results:");
console.log(`   Total warmups: ${results.length}`);
console.log(`   Successful: ${results.filter(r => r.success).length}`);
console.log(`   Failed: ${results.filter(r => !r.success).length}`);
console.log(`   Callback invocations: ${warmupCallCount}`);

if (results.length > 0) {
  console.log("\n✅ QuotaWarmer is working correctly!");
} else {
  console.log("\n⚠️  No warmups triggered. Check probe_before_minutes setting.");
}
