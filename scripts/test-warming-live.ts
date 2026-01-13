#!/usr/bin/env bun

import { loadAccounts, saveAccounts } from "../src/plugin/storage";
import { AccountManager } from "../src/plugin/accounts";
import { QuotaWarmer } from "../src/plugin/warming";
import type { QuotaWarmingConfig } from "../src/plugin/config/schema";
import { promises as fs } from "node:fs";

const BACKUP_SUFFIX = ".backup-before-p6-test";

async function main() {
  console.log("🧪 P6 Quota Warming - Live Test\n");
  console.log("=" .repeat(70));
  
  const storage = await loadAccounts();
  
  if (!storage || storage.accounts.length === 0) {
    console.log("\n❌ No accounts found. Run 'opencode auth login' first.");
    process.exit(1);
  }
  
  console.log(`\n📊 Found ${storage.accounts.length} account(s)\n`);
  
  const now = Date.now();
  storage.accounts.forEach((account, i) => {
    console.log(`🔑 Account ${i + 1}: ${account.email || "(no email)"}`);
    
    const quotas = account.rateLimitResetTimes || {};
    const quotaKeys = Object.keys(quotas);
    
    if (quotaKeys.length === 0) {
      console.log("   ✅ No active rate limits\n");
    } else {
      quotaKeys.forEach(quotaKey => {
        const resetTime = quotas[quotaKey];
        if (resetTime === undefined) return;
        
        const timeUntilReset = resetTime - now;
        if (timeUntilReset <= 0) {
          console.log(`   ✅ ${quotaKey}: Available (expired)`);
        } else {
          const minutes = Math.ceil(timeUntilReset / 60000);
          console.log(`   🔒 ${quotaKey}: Reset in ${minutes}m`);
        }
      });
      console.log("");
    }
  });
  
  console.log("=" .repeat(70));
  console.log("\n⚠️  Simulation Mode\n");
  console.log("This will:");
  console.log("  1. Backup your current accounts file");
  console.log("  2. Modify rate limit times to simulate upcoming resets");
  console.log("  3. Run QuotaWarmer to test warming behavior");
  console.log("  4. Restore original accounts file\n");
  
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const answer = await rl.question("Continue with simulation? [y/N]: ");
  rl.close();
  
  if (answer.toLowerCase() !== 'y') {
    console.log("\n❌ Test cancelled.");
    process.exit(0);
  }
  
  console.log("\n🔄 Starting simulation...\n");
  
  const { getStoragePath } = await import("../src/plugin/storage");
  const storagePath = getStoragePath();
  const backupPath = storagePath + BACKUP_SUFFIX;
  
  try {
    await fs.writeFile(backupPath, JSON.stringify(storage, null, 2));
    console.log(`✅ Backed up to: ${backupPath}\n`);
  } catch (err) {
    console.error("❌ Failed to create backup:", err);
    process.exit(1);
  }
  
  const simulatedStorage = JSON.parse(JSON.stringify(storage));
  const fiveMinutesLater = now + 5 * 60 * 1000;
  
  simulatedStorage.accounts.forEach((account: any, i: number) => {
    account.rateLimitResetTimes = account.rateLimitResetTimes || {};
    if (i === 0) {
      account.rateLimitResetTimes["claude"] = fiveMinutesLater;
      console.log(`📝 Account ${i + 1} (${account.email}): Simulated Claude reset in 5min`);
    }
    if (i === 1) {
      account.rateLimitResetTimes["gemini-antigravity"] = fiveMinutesLater + 2 * 60 * 1000;
      console.log(`📝 Account ${i + 1} (${account.email}): Simulated Gemini reset in 7min`);
    }
    if (i === 2) {
      account.rateLimitResetTimes["gemini-cli"] = fiveMinutesLater - 1 * 60 * 1000;
      console.log(`📝 Account ${i + 1} (${account.email}): Simulated Gemini CLI reset in 4min`);
    }
  });
  
  console.log("");
  
  const accountManager = new AccountManager(undefined, simulatedStorage);
  
  const config: QuotaWarmingConfig = {
    enabled: true,
    interval_minutes: 1,
    probe_before_minutes: 10,
  };
  
  let warmupCallCount = 0;
  const warmupResults: any[] = [];
  
  const warmupCallback = async (account: any, family: any, quotaKey: any) => {
    warmupCallCount++;
    const resetTime = account.rateLimitResetTimes[quotaKey];
    const minutesUntilReset = Math.round((resetTime - now) / 60000);
    
    const result = {
      account: account.email,
      family,
      quotaKey,
      minutesUntilReset,
      resetTime: new Date(resetTime).toLocaleString(),
    };
    
    warmupResults.push(result);
    
    console.log(`\n🔥 Warmup triggered:`);
    console.log(`   Account: ${result.account}`);
    console.log(`   Family: ${result.family}`);
    console.log(`   Quota: ${result.quotaKey}`);
    console.log(`   Reset in: ${result.minutesUntilReset} minutes`);
    console.log(`   Reset time: ${result.resetTime}`);
    
    return true;
  };
  
  const warmer = new QuotaWarmer(accountManager as any, config, warmupCallback);
  
  console.log("⏱️  Running QuotaWarmer.checkAndWarm()...\n");
  
  const results = await warmer.checkAndWarm();
  
  console.log("\n" + "=".repeat(70));
  console.log("\n📈 Warming Results:\n");
  console.log(`   Total warmups attempted: ${results.length}`);
  console.log(`   Successful: ${results.filter(r => r.success).length}`);
  console.log(`   Failed: ${results.filter(r => !r.success).length}`);
  console.log(`   Callback invocations: ${warmupCallCount}\n`);
  
  if (warmupResults.length > 0) {
    console.log("📋 Warmed Accounts:\n");
    warmupResults.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.account}`);
      console.log(`      Quota: ${r.quotaKey} (${r.family})`);
      console.log(`      Reset in: ${r.minutesUntilReset} minutes\n`);
    });
  }
  
  // Restore original storage
  console.log("=".repeat(70));
  console.log("\n🔄 Restoring original accounts file...");
  
  try {
    await saveAccounts(storage);
    console.log("✅ Restored successfully\n");
    
    await fs.unlink(backupPath);
    console.log(`🗑️  Removed backup file\n`);
  } catch (err) {
    console.error("❌ Failed to restore:", err);
    console.log(`\n⚠️  Manual restore required from: ${backupPath}`);
    process.exit(1);
  }
  
  console.log("=".repeat(70));
  if (results.length > 0 && results.every(r => r.success)) {
    console.log("\n✅ P6 Quota Warming is working correctly!\n");
  } else if (results.length === 0) {
    console.log("\n⚠️  No warmups triggered.");
    console.log("   This might be expected if probe window is too narrow.\n");
  } else {
    console.log("\n⚠️  Some warmups failed. Check the logs above.\n");
  }
}

main().catch(err => {
  console.error("\n❌ Test failed:", err);
  process.exit(1);
});
