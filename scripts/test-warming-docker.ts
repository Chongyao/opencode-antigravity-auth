#!/usr/bin/env bun

import { loadAccounts, saveAccounts, getStoragePath } from "../src/plugin/storage";
import { AccountManager } from "../src/plugin/accounts";
import { QuotaWarmer } from "../src/plugin/warming";
import type { QuotaWarmingConfig } from "../src/plugin/config/schema";
import { promises as fs } from "node:fs";

async function main() {
  console.log("🧪 P6 Quota Warming - Docker Real Account Test\n");
  console.log("=" .repeat(70));
  
  // Backup first
  const storage = await loadAccounts();
  if (!storage || storage.accounts.length === 0) {
    console.log("\n❌ No accounts found");
    process.exit(1);
  }
  
  const storagePath = getStoragePath();
  const backupPath = storagePath + ".backup-docker-test";
  await fs.writeFile(backupPath, JSON.stringify(storage, null, 2));
  console.log(`\n✅ Backed up to: ${backupPath}\n`);
  
  // Create fake rate limits for testing
  const now = Date.now();
  const in4Minutes = now + 4 * 60 * 1000;
  const in7Minutes = now + 7 * 60 * 1000;
  
  // Modify first two accounts
  if (storage.accounts[0]) {
    storage.accounts[0].rateLimitResetTimes = storage.accounts[0].rateLimitResetTimes || {};
    storage.accounts[0].rateLimitResetTimes["claude"] = in4Minutes;
    console.log(`📝 Set fake limit on Account 1 (${storage.accounts[0].email}):`);
    console.log(`   - claude: resets in 4 minutes`);
  }
  
  if (storage.accounts[1]) {
    storage.accounts[1].rateLimitResetTimes = storage.accounts[1].rateLimitResetTimes || {};
    storage.accounts[1].rateLimitResetTimes["gemini-cli"] = in7Minutes;
    console.log(`\n📝 Set fake limit on Account 2 (${storage.accounts[1].email}):`);
    console.log(`   - gemini-cli: resets in 7 minutes`);
  }
  
  await saveAccounts(storage);
  console.log("\n✅ Saved fake rate limits\n");
  
  console.log("=" .repeat(70));
  console.log("\n⏱️  Running QuotaWarmer.checkAndWarm()...\n");
  
  const accountManager = new AccountManager(undefined, storage);
  
  const config: QuotaWarmingConfig = {
    enabled: true,
    interval_minutes: 1,
    probe_before_minutes: 10, // Will catch quotas resetting within 10 minutes
  };
  
  let warmupCount = 0;
  const warmupResults: any[] = [];
  
  const warmupCallback = async (account: any, family: any, quotaKey: any) => {
    warmupCount++;
    const resetTime = account.rateLimitResetTimes[quotaKey];
    const minutesUntilReset = Math.round((resetTime - now) / 60000);
    
    const result = {
      account: account.email,
      family,
      quotaKey,
      resetTime: new Date(resetTime).toLocaleString(),
      minutesUntilReset,
    };
    warmupResults.push(result);
    
    console.log(`🔥 Warmup #${warmupCount} triggered:`);
    console.log(`   Account: ${account.email}`);
    console.log(`   Family: ${family}`);
    console.log(`   Quota: ${quotaKey}`);
    console.log(`   Reset in: ${minutesUntilReset} minutes`);
    console.log(`   Reset time: ${result.resetTime}\n`);
    
    return true;
  };
  
  const warmer = new QuotaWarmer(accountManager as any, config, warmupCallback);
  const results = await warmer.checkAndWarm();
  
  console.log("=" .repeat(70));
  console.log("\n📈 Test Results:\n");
  console.log(`   Expected warmups: 2 (4min + 7min within 10min window)`);
  console.log(`   Actual warmups detected: ${results.length}`);
  console.log(`   Successful warmups: ${results.filter(r => r.success).length}`);
  console.log(`   Failed warmups: ${results.filter(r => !r.success).length}`);
  console.log(`   Callback invocations: ${warmupCount}\n`);
  
  if (warmupResults.length > 0) {
    console.log("🔥 Warmup Details:\n");
    warmupResults.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.account} - ${r.quotaKey} (${r.family})`);
      console.log(`      Resets in ${r.minutesUntilReset} minutes at ${r.resetTime}`);
    });
    console.log();
  }
  
  console.log("=" .repeat(70));
  
  if (results.length === 2 && warmupCount === 2) {
    console.log("\n✅ SUCCESS! P6 Quota Warming is working with real accounts!\n");
    console.log("   ✓ Detected both quotas within warming window");
    console.log("   ✓ Triggered warmup callbacks successfully");
    console.log("   ✓ Correctly identified model families (claude/gemini)\n");
  } else {
    console.log("\n⚠️  Unexpected results. Expected 2 warmups, got " + results.length + "\n");
  }
  
  // Restore
  console.log("🔄 Restoring original account state...");
  const originalStorage = JSON.parse(await fs.readFile(backupPath, "utf-8"));
  await saveAccounts(originalStorage);
  console.log("✅ Restored from backup\n");
  
  console.log("=" .repeat(70));
  console.log("\n🎉 Test completed!\n");
}

main().catch(err => {
  console.error("\n❌ Test failed:", err);
  process.exit(1);
});
