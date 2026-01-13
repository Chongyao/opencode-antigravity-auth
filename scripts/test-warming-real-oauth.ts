#!/usr/bin/env bun

import { loadAccounts, saveAccounts, getStoragePath } from "../src/plugin/storage";
import { AccountManager } from "../src/plugin/accounts";
import { QuotaWarmer } from "../src/plugin/warming";
import type { QuotaWarmingConfig } from "../src/plugin/config/schema";
import type { ManagedAccount, ModelFamily, QuotaKey } from "../src/plugin/accounts";
import { ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from "../src/constants";
import { promises as fs } from "node:fs";

interface TokenRefreshResult {
  access_token: string;
  expires_in: number;
}

const refreshOAuthToken = async (refreshTokenStr: string): Promise<TokenRefreshResult | null> => {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshTokenStr,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`      ❌ HTTP ${response.status}: ${errorText}`);
      return null;
    }

    const data = await response.json() as any;
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
    };
  } catch (error) {
    console.log(`      ❌ Network error: ${error}`);
    return null;
  }
};

async function main() {
  console.log("🧪 P6 Quota Warming - REAL OAUTH TOKEN REFRESH TEST\n");
  console.log("=" .repeat(70));
  console.log("\n⚠️  This will ACTUALLY call Google OAuth API and SAVE real tokens!");
  console.log("=" .repeat(70));
  
  const storage = await loadAccounts();
  if (!storage || storage.accounts.length === 0) {
    console.log("\n❌ No accounts found");
    process.exit(1);
  }
  
  const backupPath = getStoragePath() + ".backup-real-oauth-test";
  await fs.writeFile(backupPath, JSON.stringify(storage, null, 2));
  console.log(`\n✅ Backup created: ${backupPath}\n`);
  
  console.log("📝 Step 1: Create fake rate limits\n");
  const now = Date.now();
  const in3Minutes = now + 3 * 60 * 1000;
  const in6Minutes = now + 6 * 60 * 1000;
  
  if (storage.accounts[0]) {
    storage.accounts[0].rateLimitResetTimes = storage.accounts[0].rateLimitResetTimes || {};
    storage.accounts[0].rateLimitResetTimes["claude"] = in3Minutes;
    console.log(`✓ Account 1 (${storage.accounts[0].email}): claude resets in 3 min`);
  }
  
  if (storage.accounts[1]) {
    storage.accounts[1].rateLimitResetTimes = storage.accounts[1].rateLimitResetTimes || {};
    storage.accounts[1].rateLimitResetTimes["gemini-cli"] = in6Minutes;
    console.log(`✓ Account 2 (${storage.accounts[1].email}): gemini-cli resets in 6 min`);
  }
  
  await saveAccounts(storage);
  
  console.log("\n📝 Step 2: Token status BEFORE warming\n");
  const accountManagerBefore = new AccountManager(undefined, storage);
  const accountsBefore = accountManagerBefore.getAccounts();
  
  accountsBefore.slice(0, 2).forEach((acc, i) => {
    console.log(`Account ${i + 1} (${acc.email}):`);
    console.log(`  Token: ${acc.access ? "EXISTS" : "MISSING"}`);
    console.log(`  Expires: ${acc.expires ? new Date(acc.expires).toLocaleString() : "unknown"}`);
  });
  
  console.log("\n📝 Step 3: Run QuotaWarmer with REAL OAuth refresh\n");
  console.log("=" .repeat(70));
  
  const config: QuotaWarmingConfig = {
    enabled: true,
    interval_minutes: 1,
    probe_before_minutes: 10,
  };
  
  const refreshedAccounts: Array<{index: number; access: string; expires: number}> = [];
  
  const warmupCallback = async (
    account: ManagedAccount,
    family: ModelFamily,
    quotaKey: QuotaKey,
  ): Promise<boolean> => {
    console.log(`\n🔥 [REAL WARMUP] ${account.email}`);
    console.log(`   Quota: ${quotaKey} (${family})`);
    console.log(`   Before: token=${account.access ? "EXISTS" : "MISSING"}`);
    
    const refreshTokenStr = account.parts.refreshToken;
    const result = await refreshOAuthToken(refreshTokenStr);
    
    if (!result) {
      console.log(`   ❌ Failed to refresh`);
      return false;
    }
    
    const expiresAt = Date.now() + result.expires_in * 1000;
    const expiresIn = Math.round((expiresAt - Date.now()) / 60000);
    
    account.access = result.access_token;
    account.expires = expiresAt;
    
    refreshedAccounts.push({
      index: account.index,
      access: result.access_token,
      expires: expiresAt,
    });
    
    console.log(`   ✅ Token refreshed!`);
    console.log(`   After: token=${result.access_token.substring(0, 25)}...`);
    console.log(`   Expires: ${expiresIn}min (${new Date(expiresAt).toLocaleString()})`);
    
    return true;
  };
  
  const accountManager = new AccountManager(undefined, storage);
  const warmer = new QuotaWarmer(accountManager as any, config, warmupCallback);
  const results = await warmer.checkAndWarm();
  
  console.log("\n" + "=" .repeat(70));
  console.log(`\n📈 Results: ${results.length} warmups, ${results.filter(r => r.success).length} successful\n`);
  
  console.log("\n📝 Step 4: Validate refreshed tokens by making API calls\n");
  
  let validTokenCount = 0;
  
  for (const refreshed of refreshedAccounts) {
    const account = accountManager.getAccounts()[refreshed.index];
    if (!account) continue;
    
    const projectId = account.parts.projectId || account.parts.managedProjectId || "warming-test";
    
    console.log(`Testing token for account ${refreshed.index + 1} (${account.email}):`);
    console.log(`  Project: ${projectId}`);
    
    try {
      const validationResponse = await fetch("https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${refreshed.access}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project: projectId,
          model: "gemini-2.0-flash-thinking-exp-01-21",
          requestType: "agent",
          request: {
            contents: [{
              role: "user",
              parts: [{ text: "ok" }]
            }],
            generationConfig: {
              maxOutputTokens: 5,
            }
          }
        }),
      });
      
      if (validationResponse.status === 401 || validationResponse.status === 403) {
        console.log(`  ❌ Token is INVALID - Auth failed (${validationResponse.status})`);
      } else if (validationResponse.ok) {
        console.log(`  ✅ Token is VALID - API responded with 200 OK`);
        validTokenCount++;
      } else {
        const errorText = await validationResponse.text();
        const isAuthError = errorText.includes("UNAUTHENTICATED") || errorText.includes("PERMISSION_DENIED");
        
        if (isAuthError) {
          console.log(`  ❌ Token is INVALID - Auth error in response`);
        } else {
          console.log(`  ✅ Token is VALID - Auth passed (${validationResponse.status}, non-auth error)`);
          validTokenCount++;
        }
        
        if (errorText.length < 500) {
          console.log(`     Response: ${errorText.substring(0, 200)}`);
        }
      }
    } catch (error) {
      console.log(`  ❌ Network error during validation: ${error}`);
    }
    console.log();
  }
  
  console.log("=" .repeat(70));
  
  if (results.length > 0 && results.every(r => r.success) && validTokenCount === refreshedAccounts.length) {
    console.log("\n✅ COMPLETE SUCCESS!\n");
    console.log("Verified:");
    console.log("  ✓ Detected upcoming quota resets");
    console.log("  ✓ Called Google OAuth API");
    console.log("  ✓ Refreshed access tokens");
    console.log(`  ✓ Validated ${validTokenCount}/${refreshedAccounts.length} tokens with real API calls`);
    console.log("  ✓ All tokens are working correctly\n");
  } else {
    console.log("\n⚠️  PARTIAL SUCCESS\n");
    console.log(`Valid tokens: ${validTokenCount}/${refreshedAccounts.length}`);
    console.log("Some tokens may have issues - check logs above\n");
  }
  
  console.log(`📋 Backup: ${backupPath}`);
  console.log(`💾 Storage: ${getStoragePath()}\n`);
}

main().catch(err => {
  console.error("\n❌ Test failed:", err);
  console.error(err.stack);
  process.exit(1);
});
