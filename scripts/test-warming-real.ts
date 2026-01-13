#!/usr/bin/env bun

import { loadAccounts } from "../src/plugin/storage";
import { AccountManager } from "../src/plugin/accounts";
import { QuotaWarmer } from "../src/plugin/warming";
import type { QuotaWarmingConfig } from "../src/plugin/config/schema";

async function main() {
  console.log("🧪 P6 Quota Warming - Real Account Test\n");
  console.log("=" .repeat(70));
  
  const storage = await loadAccounts();
  if (!storage || storage.accounts.length === 0) {
    console.log("\n❌ No accounts found");
    process.exit(1);
  }
  
  const now = Date.now();
  
  console.log("\n📊 Current Rate Limit Status:\n");
  
  let hasActiveLimits = false;
  storage.accounts.forEach((account, i) => {
    const quotas = account.rateLimitResetTimes || {};
    const quotaKeys = Object.keys(quotas);
    
    if (quotaKeys.length === 0) {
      console.log(`🔑 Account ${i + 1} (${account.email}): No rate limits`);
      return;
    }
    
    console.log(`🔑 Account ${i + 1} (${account.email}):`);
    
    quotaKeys.forEach(quotaKey => {
      const resetTime = quotas[quotaKey];
      if (resetTime === undefined) return;
      
      const timeUntilReset = resetTime - now;
      
      if (timeUntilReset <= 0) {
        console.log(`   ✅ ${quotaKey}: Available (expired ${Math.abs(Math.round(timeUntilReset / 60000))}m ago)`);
      } else {
        hasActiveLimits = true;
        const minutes = Math.ceil(timeUntilReset / 60000);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        let timeStr;
        if (hours > 0) {
          timeStr = `${hours}h ${remainingMinutes}m`;
        } else {
          timeStr = `${minutes}m`;
        }
        
        console.log(`   🔒 ${quotaKey}: Rate limited - resets in ${timeStr}`);
        console.log(`      Reset time: ${new Date(resetTime).toLocaleString()}`);
      }
    });
  });
  
  console.log("\n" + "=".repeat(70));
  
  if (!hasActiveLimits) {
    console.log("\n⚠️  No active rate limits found!");
    console.log("\nTo test P6 warming:");
    console.log("  1. Run: bun run scripts/create-fake-limit.ts");
    console.log("  2. Then run this script again\n");
    process.exit(0);
  }
  
  console.log("\n⏱️  Testing QuotaWarmer with REAL accounts...\n");
  
  const accountManager = new AccountManager(undefined, storage);
  
  const config: QuotaWarmingConfig = {
    enabled: true,
    interval_minutes: 1,
    probe_before_minutes: 10,
  };
  
  let warmupCount = 0;
  const warmupCallback = async (account: any, family: any, quotaKey: any) => {
    warmupCount++;
    const resetTime = account.rateLimitResetTimes[quotaKey];
    const minutesUntilReset = Math.round((resetTime - now) / 60000);
    
    console.log(`🔥 Warmup triggered:`);
    console.log(`   Account: ${account.email}`);
    console.log(`   Family: ${family}`);
    console.log(`   Quota: ${quotaKey}`);
    console.log(`   Reset in: ${minutesUntilReset} minutes`);
    console.log(`   Reset time: ${new Date(resetTime).toLocaleString()}\n`);
    
    return true;
  };
  
  const warmer = new QuotaWarmer(accountManager as any, config, warmupCallback);
  const results = await warmer.checkAndWarm();
  
  console.log("=".repeat(70));
  console.log("\n📈 Warming Results:\n");
  console.log(`   Quotas detected for warming: ${results.length}`);
  console.log(`   Successful warmups: ${results.filter(r => r.success).length}`);
  console.log(`   Failed warmups: ${results.filter(r => !r.success).length}`);
  console.log(`   Callback invocations: ${warmupCount}\n`);
  
  if (results.length > 0) {
    console.log("✅ P6 Quota Warming is detecting and warming rate-limited accounts!\n");
  } else {
    console.log("ℹ️  No quotas within the warming window (probe_before_minutes: 10)\n");
    console.log("   This means all rate limits are either:");
    console.log("   - Already expired (available)");
    console.log("   - Too far in the future (> 10 minutes)\n");
  }
}

main().catch(err => {
  console.error("\n❌ Test failed:", err);
  process.exit(1);
});
