# 正确的端到端测试工作流

## 问题分析

当前 `scripts/dev-container.sh` **只是挂载了项目目录**，并没有在容器内安装插件，所以：
- ❌ 容器内的 opencode 无法使用本地开发的插件代码
- ❌ 无法测试新功能

## 正确的测试方式

### 方案 A: 本地构建 + npm link (推荐)

```bash
# 1. 在宿主机构建插件
cd /home/zcy/workspace/cloned_projects/opencode-antigravity-auth
./scripts/dev-container.sh bun run build

# 2. 进入容器并链接本地插件
./scripts/dev-container.sh bash

# 在容器内执行:
cd /workspace
bun link

# 在 opencode 全局目录链接
cd $(bun pm -g bin)/../..
bun link opencode-antigravity-auth

# 3. 验证插件已安装
bun pm ls -g | grep antigravity

# 4. 启用 DEBUG 运行测试
export OPENCODE_ANTIGRAVITY_DEBUG=2
opencode run "hi" --model=google/antigravity-claude-sonnet-4-5
```

### 方案 B: 容器内本地安装

```bash
# 1. 修改容器内的 opencode.json 指向本地路径
./scripts/dev-container.sh bash

# 在容器内执行:
cd /workspace
bun run build

# 修改配置使用本地插件
cat > /root/.config/opencode/opencode.json <<EOF
{
  "plugin": [
    "file:///workspace"
  ],
  "provider": {
    "google": {
      "models": {
        "antigravity-claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        }
      }
    }
  }
}
EOF

# 2. 测试
export OPENCODE_ANTIGRAVITY_DEBUG=2
opencode run "hi" --model=google/antigravity-claude-sonnet-4-5
```

### 方案 C: 发布到本地 npm registry (最接近生产)

```bash
# 1. 在宿主机打包
cd /home/zcy/workspace/cloned_projects/opencode-antigravity-auth
./scripts/dev-container.sh bun run build
./scripts/dev-container.sh bun pack

# 2. 进入容器安装
./scripts/dev-container.sh bash

# 在容器内:
cd /workspace
bun install -g ./opencode-antigravity-auth-*.tgz

# 3. 配置 opencode.json
cat > /root/.config/opencode/opencode.json <<EOF
{
  "plugin": ["opencode-antigravity-auth"]
}
EOF

# 4. 测试
export OPENCODE_ANTIGRAVITY_DEBUG=2
opencode run "hi" --model=google/antigravity-claude-sonnet-4-5
```

---

## 推荐: 创建一键测试脚本

创建 `scripts/test-in-docker.sh`:

```bash
#!/bin/bash
# One-click test script for opencode-antigravity-auth in Docker

set -e

PROJECT_DIR="/home/zcy/workspace/cloned_projects/opencode-antigravity-auth"
CONTAINER_NAME="opencode-plugin-test-$$"

echo "==== Step 1: Build plugin ===="
cd "$PROJECT_DIR"
./scripts/dev-container.sh bun run build

echo "==== Step 2: Create test container ===="
docker run -d \
  --name "$CONTAINER_NAME" \
  --network=host \
  -v "$PROJECT_DIR:/workspace" \
  -v "$HOME/.config/opencode:/root/.config/opencode" \
  opencode-plugin-dev:latest \
  tail -f /dev/null

echo "==== Step 3: Install plugin in container ===="
docker exec "$CONTAINER_NAME" bash -c "
  cd /workspace
  bun link
  cd /root/.bun/install/global
  bun link opencode-antigravity-auth
  echo 'Plugin installed'
"

echo "==== Step 4: Configure opencode ===="
docker exec "$CONTAINER_NAME" bash -c "
  mkdir -p /root/.config/opencode
  cat > /root/.config/opencode/opencode.json <<'EOF'
{
  \"plugin\": [\"opencode-antigravity-auth\"],
  \"provider\": {
    \"google\": {
      \"models\": {
        \"antigravity-claude-sonnet-4-5\": {
          \"name\": \"Claude Sonnet 4.5\",
          \"limit\": { \"context\": 200000, \"output\": 64000 },
          \"modalities\": { \"input\": [\"text\", \"image\"], \"output\": [\"text\"] }
        }
      }
    }
  }
}
EOF
"

echo "==== Step 5: Run test ===="
docker exec -e OPENCODE_ANTIGRAVITY_DEBUG=2 "$CONTAINER_NAME" bash -c "
  opencode run 'Hello, say hi back' --model=google/antigravity-claude-sonnet-4-5
"

echo "==== Step 6: Check logs ===="
docker exec "$CONTAINER_NAME" bash -c "
  ls -lh /root/.config/opencode/antigravity-logs/
  echo '--- Last 50 lines of log ---'
  tail -50 /root/.config/opencode/antigravity-logs/antigravity-debug-*.log || echo 'No logs found'
"

echo "==== Cleanup (press Ctrl+C to keep container for manual testing) ===="
sleep 5
docker stop "$CONTAINER_NAME"
docker rm "$CONTAINER_NAME"

echo "==== Test complete ===="
```

使用方法:
```bash
chmod +x scripts/test-in-docker.sh
./scripts/test-in-docker.sh
```

---

## 手动测试步骤 (推荐方案 B)

### 1. 准备环境

```bash
# 进入容器
cd /home/zcy/workspace/cloned_projects/opencode-antigravity-auth
./scripts/dev-container.sh bash
```

### 2. 在容器内执行

```bash
# 构建插件
cd /workspace
bun run build

# 配置 opencode 使用本地插件
cat > /root/.config/opencode/opencode.json <<'EOF'
{
  "plugin": ["file:///workspace"],
  "provider": {
    "google": {
      "models": {
        "antigravity-claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "antigravity-claude-sonnet-4-5-thinking": {
          "name": "Claude Sonnet 4.5 Thinking",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        }
      }
    }
  }
}
EOF

# 启用 DEBUG 模式
export OPENCODE_ANTIGRAVITY_DEBUG=2

# 测试基础请求
opencode run "Hello, say hi back" --model=google/antigravity-claude-sonnet-4-5
```

### 3. 触发 429 测试新功能

```bash
# 并发请求触发限流
for i in {1..20}; do
  opencode run "test $i" --model=google/antigravity-claude-sonnet-4-5 &
done
wait
```

### 4. 检查结果

```bash
# 查看日志
tail -100 /root/.config/opencode/antigravity-logs/antigravity-debug-*.log

# 查找关键字
grep -E "(parsedReason|lastRateLimitReason)" /root/.config/opencode/antigravity-logs/antigravity-debug-*.log

# 检查账号状态
cat /root/.config/opencode/antigravity-accounts.json | jq '.accounts[0].lastRateLimitReason'
```

---

## 验证清单

- [ ] 插件在容器内成功加载
- [ ] 日志显示 `parsedReason`
- [ ] `antigravity-accounts.json` 包含 `lastRateLimitReason`
- [ ] 退避时间根据原因类型变化

---

## 常见问题

### Q: `opencode: command not found`
A: 容器内 opencode 未安装或不在 PATH。检查镜像构建。

### Q: 插件加载失败
A: 检查 `file:///workspace` 路径是否正确，或使用 `bun link` 方案。

### Q: 没有 429 触发
A: 并发数不够，或账号配额充足。尝试使用更耗资源的模型。
