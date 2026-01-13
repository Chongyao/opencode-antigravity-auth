#!/usr/bin/env bun

import { loadAccounts } from "../src/plugin/storage";
import { AccountManager } from "../src/plugin/accounts";

async function main() {
  console.log("🔐 Antigravity Account Token Expiry Status\n");
  console.log("=" .repeat(70));
  
  const storage = await loadAccounts();
  if (!storage || storage.accounts.length === 0) {
    console.log("\n❌ No accounts found");
    process.exit(1);
  }
  
  const accountManager = new AccountManager(undefined, storage);
  const accounts = accountManager.getAccounts();
  
  const now = Date.now();
  
  console.log(`\n📊 Total Accounts: ${accounts.length}\n`);
  
  accounts.forEach((account, i) => {
    console.log(`🔑 Account ${i + 1}: ${account.email || "(no email)"}`);
    console.log("-".repeat(70));
    
    if (account.expires) {
      const expiresAt = account.expires;
      const timeUntilExpiry = expiresAt - now;
      
      if (timeUntilExpiry <= 0) {
        const expiredAgo = Math.abs(Math.round(timeUntilExpiry / 60000));
        console.log(`  ⚠️  Access Token: EXPIRED ${expiredAgo} minutes ago`);
        console.log(`      Expired at: ${new Date(expiresAt).toLocaleString()}`);
        console.log(`      🔄 Will be refreshed on next request`);
      } else {
        const minutes = Math.ceil(timeUntilExpiry / 60000);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        let timeStr;
        if (hours > 0) {
          timeStr = `${hours}h ${remainingMinutes}m`;
        } else {
          timeStr = `${minutes}m`;
        }
        
        console.log(`  ✅ Access Token: Valid`);
        console.log(`      Expires in: ${timeStr}`);
        console.log(`      Expires at: ${new Date(expiresAt).toLocaleString()}`);
      }
    } else {
      console.log(`  ❓ Access Token: Unknown expiry (not yet fetched)`);
    }
    
    if (account.access) {
      const tokenPreview = account.access.substring(0, 20) + "...";
      console.log(`      Token preview: ${tokenPreview}`);
    } else {
      console.log(`      ⚠️  No access token (needs refresh)`);
    }
    
    console.log();
  });
  
  console.log("=" .repeat(70));
  console.log("\n💡 Notes:");
  console.log("  - Access tokens typically expire after 1 hour");
  console.log("  - Plugin auto-refreshes tokens 30 minutes before expiry");
  console.log("  - Expired tokens will be refreshed on next API request");
  console.log("  - Quota warming will trigger token refresh for soon-to-reset quotas\n");
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
