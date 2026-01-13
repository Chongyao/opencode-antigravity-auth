#!/usr/bin/env bun

import { loadAccounts } from "../src/plugin/storage";

async function main() {
  const storage = await loadAccounts();
  
  if (!storage || storage.accounts.length === 0) {
    console.log("❌ No accounts found. Run 'opencode auth login' first.");
    process.exit(1);
  }

  const now = Date.now();
  
  console.log("📊 Antigravity Account Quota Status\n");
  console.log("=" .repeat(70));
  
  storage.accounts.forEach((account, i) => {
    console.log(`\n🔑 Account ${i + 1}: ${account.email || "(no email)"}`);
    console.log("-".repeat(70));
    
    const quotas = account.rateLimitResetTimes || {};
    const quotaKeys = Object.keys(quotas);
    
    if (quotaKeys.length === 0) {
      console.log("  ✅ All quotas available (no rate limits)");
    } else {
      quotaKeys.forEach(quotaKey => {
        const resetTime = quotas[quotaKey];
        if (resetTime === undefined) return;
        
        const timeUntilReset = resetTime - now;
        const isExpired = timeUntilReset <= 0;
        
        if (isExpired) {
          console.log(`  ✅ ${quotaKey}: Available (limit expired)`);
        } else {
          const minutes = Math.ceil(timeUntilReset / 60000);
          const hours = Math.floor(minutes / 60);
          const remainingMinutes = minutes % 60;
          
          let timeStr;
          if (hours > 0) {
            timeStr = `${hours}h ${remainingMinutes}m`;
          } else {
            timeStr = `${minutes}m`;
          }
          
          const resetDate = new Date(resetTime);
          console.log(`  🔒 ${quotaKey}: Rate limited`);
          console.log(`     ⏰ Resets in: ${timeStr}`);
          console.log(`     📅 Reset time: ${resetDate.toLocaleString()}`);
        }
      });
    }
  });
  
  console.log("\n" + "=".repeat(70));
  console.log(`\n📍 Storage location: ~/.config/opencode/antigravity-accounts.json`);
  console.log(`⏰ Current time: ${new Date().toLocaleString()}\n`);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
