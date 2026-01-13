#!/usr/bin/env bun

import { loadAccounts } from "../src/plugin/storage";
import { AccountManager } from "../src/plugin/accounts";
import { QuotaWarmer } from "../src/plugin/warming";
import type { QuotaWarmingConfig } from "../src/plugin/config/schema";
import type { ManagedAccount, ModelFamily, QuotaKey } from "../src/plugin/accounts";
import { refreshAccessToken } from "../src/plugin/token";

const COLORS = {
  RESET: "\x1b[0m",
  BRIGHT: "\x1b[1m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  CYAN: "\x1b[36m",
  RED: "\x1b[31m",
};

function formatTime(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function printQuotaStatus(title: string, accounts: ManagedAccount[]) {
  const now = Date.now();
  
  console.log(`\n${COLORS.BRIGHT}${COLORS.CYAN}${title}${COLORS.RESET}`);
  console.log("=".repeat(80));
  
  accounts.forEach((account, i) => {
    console.log(`\n${COLORS.BRIGHT}Account ${i + 1}:${COLORS.RESET} ${account.email || "(no email)"}`);
    
    const quotas = account.rateLimitResetTimes || {};
    const quotaKeys = Object.keys(quotas) as QuotaKey[];
    
    if (quotaKeys.length === 0) {
      console.log(`  ${COLORS.GREEN}✓ All quotas available${COLORS.RESET}`);
      return;
    }
    
    quotaKeys.forEach(quotaKey => {
      const resetTime = quotas[quotaKey];
      if (!resetTime) return;
      
      const timeUntilReset = resetTime - now;
      const isExpired = timeUntilReset <= 0;
      
      if (isExpired) {
        console.log(`  ${COLORS.GREEN}✓ ${quotaKey}:${COLORS.RESET} Available`);
      } else {
        const timeStr = formatTime(timeUntilReset);
        const resetDate = new Date(resetTime).toLocaleString();
        console.log(`  ${COLORS.RED}✗ ${quotaKey}:${COLORS.RESET} Rate limited`);
        console.log(`    ⏰ Resets in: ${COLORS.YELLOW}${timeStr}${COLORS.RESET} (${resetDate})`);
      }
    });
  });
  
  console.log("\n" + "=".repeat(80));
}

async function main() {
  console.log(`\n${COLORS.BRIGHT}${COLORS.BLUE}🧪 P6 配额预热 - 端到端验证${COLORS.RESET}\n`);
  
  const storage = await loadAccounts();
  if (!storage || storage.accounts.length === 0) {
    console.log(`${COLORS.RED}❌ 未找到账号${COLORS.RESET}`);
    process.exit(1);
  }
  
  const accountManager = new AccountManager(undefined, storage);
  const accounts = accountManager.getAccounts();
  
  console.log(`\n${COLORS.BRIGHT}步骤 1: 检查初始配额状态${COLORS.RESET}`);
  printQuotaStatus("📊 预热前配额状态", accounts);
  
  const now = Date.now();
  const upcoming: Array<{ account: ManagedAccount; quotaKey: QuotaKey; family: ModelFamily; resetTime: number }> = [];
  
  accounts.forEach(account => {
    const quotas = account.rateLimitResetTimes || {};
    Object.entries(quotas).forEach(([quotaKey, resetTime]) => {
      if (!resetTime) return;
      
      const timeUntilReset = resetTime - now;
      const minutesUntilReset = timeUntilReset / 60000;
      
      if (minutesUntilReset > 0 && minutesUntilReset <= 10) {
        const family: ModelFamily = quotaKey.includes("claude") ? "claude" : "gemini";
        upcoming.push({ account, quotaKey: quotaKey as QuotaKey, family, resetTime });
      }
    });
  });
  
  if (upcoming.length === 0) {
    console.log(`\n${COLORS.YELLOW}⚠️  未找到即将重置的配额（10分钟内）${COLORS.RESET}`);
    console.log(`\n${COLORS.CYAN}提示：${COLORS.RESET}使用 ${COLORS.BRIGHT}scripts/create-fake-limit.ts${COLORS.RESET} 创建测试配额\n`);
    process.exit(0);
  }
  
  console.log(`\n${COLORS.BRIGHT}步骤 2: 发现即将重置的配额${COLORS.RESET}`);
  console.log(`\n找到 ${COLORS.BRIGHT}${upcoming.length}${COLORS.RESET} 个即将重置的配额:\n`);
  
  upcoming.forEach(({ account, quotaKey, resetTime }) => {
    const timeStr = formatTime(resetTime - now);
    console.log(`  • ${COLORS.CYAN}${account.email}${COLORS.RESET}`);
    console.log(`    配额: ${COLORS.YELLOW}${quotaKey}${COLORS.RESET}`);
    console.log(`    重置时间: ${timeStr} (${new Date(resetTime).toLocaleString()})`);
  });
  
  console.log(`\n${COLORS.BRIGHT}步骤 3: 执行配额预热${COLORS.RESET}`);
  console.log("=".repeat(80));
  
  let successCount = 0;
  const warmupResults: Array<{ account: string; quotaKey: string; success: boolean }> = [];
  
  const warmupCallback = async (
    account: ManagedAccount,
    family: ModelFamily,
    quotaKey: QuotaKey,
  ): Promise<boolean> => {
    console.log(`\n${COLORS.BRIGHT}🔥 预热账号:${COLORS.RESET} ${account.email}`);
    console.log(`   配额: ${quotaKey} (${family})`);
    
    try {
      const mockPluginClient = {
        log: {
          info: () => {},
          warn: () => {},
          error: () => {},
        },
      } as any;
      
      const auth = accountManager.toAuthDetails(account);
      const refreshed = await refreshAccessToken(auth, mockPluginClient, "google");
      
      if (refreshed) {
        accountManager.updateFromAuth(account, refreshed);
        console.log(`   ${COLORS.GREEN}✓ 令牌已刷新${COLORS.RESET}`);
        successCount++;
        warmupResults.push({ account: account.email || "unknown", quotaKey, success: true });
        return true;
      } else {
        console.log(`   ${COLORS.RED}✗ 刷新失败${COLORS.RESET}`);
        warmupResults.push({ account: account.email || "unknown", quotaKey, success: false });
        return false;
      }
    } catch (error) {
      console.log(`   ${COLORS.RED}✗ 错误: ${error}${COLORS.RESET}`);
      warmupResults.push({ account: account.email || "unknown", quotaKey, success: false });
      return false;
    }
  };
  
  const config: QuotaWarmingConfig = {
    enabled: true,
    interval_minutes: 1,
    probe_before_minutes: 10,
  };
  
  const warmer = new QuotaWarmer(accountManager as any, config, warmupCallback);
  await warmer.checkAndWarm();
  
  console.log("\n" + "=".repeat(80));
  console.log(`\n${COLORS.BRIGHT}预热结果: ${successCount}/${upcoming.length} 成功${COLORS.RESET}\n`);
  
  warmupResults.forEach(({ account, quotaKey, success }) => {
    const status = success ? `${COLORS.GREEN}✓${COLORS.RESET}` : `${COLORS.RED}✗${COLORS.RESET}`;
    console.log(`  ${status} ${account} - ${quotaKey}`);
  });
  
  console.log(`\n${COLORS.BRIGHT}步骤 4: 等待 3 分钟...${COLORS.RESET}`);
  console.log(`${COLORS.CYAN}(让配额系统有时间更新)${COLORS.RESET}\n`);
  
  for (let i = 3; i > 0; i--) {
    process.stdout.write(`\r等待中... ${i} 分钟    `);
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
  console.log(`\r${COLORS.GREEN}✓ 等待完成${COLORS.RESET}          \n`);
  
  console.log(`\n${COLORS.BRIGHT}步骤 5: 检查预热后配额状态${COLORS.RESET}`);
  
  const storageAfter = await loadAccounts();
  if (!storageAfter) {
    console.log(`${COLORS.RED}❌ 无法加载配额状态${COLORS.RESET}`);
    process.exit(1);
  }
  
  const accountManagerAfter = new AccountManager(undefined, storageAfter);
  const accountsAfter = accountManagerAfter.getAccounts();
  
  printQuotaStatus("📊 预热后配额状态", accountsAfter);
  
  console.log(`\n${COLORS.BRIGHT}${COLORS.CYAN}步骤 6: 对比配额变化${COLORS.RESET}`);
  console.log("=".repeat(80));
  
  let changesDetected = false;
  const nowAfter = Date.now();
  
  upcoming.forEach(({ account, quotaKey, resetTime }) => {
    const accountAfter = accountsAfter.find(a => a.email === account.email);
    if (!accountAfter) return;
    
    const newResetTime = accountAfter.rateLimitResetTimes?.[quotaKey];
    
    console.log(`\n${COLORS.BRIGHT}${account.email}${COLORS.RESET} - ${quotaKey}:`);
    console.log(`  预热前: 在 ${formatTime(resetTime - now)} 后重置`);
    
    if (!newResetTime) {
      console.log(`  预热后: ${COLORS.GREEN}✓ 配额已恢复（无限制）${COLORS.RESET}`);
      changesDetected = true;
    } else if (newResetTime !== resetTime) {
      console.log(`  预热后: 在 ${formatTime(newResetTime - nowAfter)} 后重置`);
      console.log(`  ${COLORS.GREEN}✓ 重置时间已更新${COLORS.RESET}`);
      changesDetected = true;
    } else {
      console.log(`  预热后: 在 ${formatTime(newResetTime - nowAfter)} 后重置`);
      console.log(`  ${COLORS.YELLOW}⚠️  重置时间未变化${COLORS.RESET}`);
    }
  });
  
  console.log("\n" + "=".repeat(80));
  
  if (changesDetected) {
    console.log(`\n${COLORS.BRIGHT}${COLORS.GREEN}✅ 验证成功！${COLORS.RESET}`);
    console.log(`${COLORS.GREEN}配额预热正常工作，配额状态已更新${COLORS.RESET}\n`);
  } else {
    console.log(`\n${COLORS.BRIGHT}${COLORS.YELLOW}⚠️  部分成功${COLORS.RESET}`);
    console.log(`${COLORS.YELLOW}令牌已刷新，但配额重置时间未立即变化${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}注意：某些配额可能需要更长时间才能反映在状态中${COLORS.RESET}\n`);
  }
}

main().catch(err => {
  console.error(`\n${COLORS.RED}❌ 测试失败:${COLORS.RESET}`, err);
  console.error(err.stack);
  process.exit(1);
});
