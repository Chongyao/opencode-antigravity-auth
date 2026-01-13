#!/usr/bin/env bun

import { loadAccounts, saveAccounts, getStoragePath } from "../src/plugin/storage";
import { promises as fs } from "node:fs";

async function main() {
  console.log("🔧 Creating fake rate limit for P6 testing\n");
  
  const storage = await loadAccounts();
  if (!storage || storage.accounts.length === 0) {
    console.log("❌ No accounts found");
    process.exit(1);
  }
  
  const storagePath = getStoragePath();
  const backupPath = storagePath + ".backup-before-fake-limit";
  
  await fs.writeFile(backupPath, JSON.stringify(storage, null, 2));
  console.log(`✅ Backed up to: ${backupPath}\n`);
  
  const now = Date.now();
  const in3Minutes = now + 3 * 60 * 1000;
  const in5Minutes = now + 5 * 60 * 1000;
  
  const account = storage.accounts[0];
  if (!account) {
    console.log("❌ No account to modify");
    process.exit(1);
  }
  
  account.rateLimitResetTimes = account.rateLimitResetTimes || {};
  account.rateLimitResetTimes["claude"] = in3Minutes;
  
  console.log("📝 Creating fake rate limit:");
  console.log(`   Account: ${account.email}`);
  console.log(`   Quota: claude`);
  console.log(`   Reset time: ${new Date(in3Minutes).toLocaleString()}`);
  console.log(`   Time until reset: 3 minutes\n`);
  
  await saveAccounts(storage);
  console.log("✅ Saved fake rate limit\n");
  
  console.log("=" .repeat(70));
  console.log("\n📊 Now run the following commands:\n");
  console.log("1. Check quota status:");
  console.log("   ./scripts/quota-status.sh\n");
  console.log("2. Test P6 warming (should detect the 3-minute reset):");
  console.log("   ./scripts/dev-container.sh bun run scripts/test-warming-real.ts\n");
  console.log("3. To restore original state:");
  console.log(`   cp ${backupPath} ${storagePath}\n`);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
