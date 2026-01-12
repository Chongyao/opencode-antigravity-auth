# 严重问题报告与修复

## ❌ 问题

原来的 `test-in-docker.sh` 脚本**直接挂载了宿主机的配置目录**：
```bash
-v "$HOME/.config/opencode:/root/.config/opencode"
```

这导致：
- 容器内修改配置文件会**直接改变宿主机的 opencode 配置**
- `file:///workspace` 路径在宿主机上无效，导致宿主机的 opencode 无法正常工作

## ✅ 修复方案

新脚本 `test-isolated.sh` 采用**完全隔离**的方式：

### 1. 创建临时配置目录
```bash
TEMP_DIR=$(mktemp -d)
```

### 2. 只**拷贝**必要的认证文件（不挂载）
```bash
cp "$HOST_CONFIG_DIR/antigravity-accounts.json" "$TEMP_DIR/"
cp "$HOST_AUTH_FILE" "$TEMP_DIR/share/auth.json"
```

### 3. 在临时目录创建隔离的配置文件
```bash
cat > "$TEMP_DIR/opencode.json" <<'EOF'
{
  "plugin": ["file:///workspace"],
  ...
}
EOF
```

### 4. 挂载**临时目录**而非宿主配置
```bash
-v "$TEMP_DIR:/container-config"  # 只读拷贝源
```

### 5. 容器内拷贝配置（不是直接使用挂载）
```bash
cp /container-config/opencode.json /root/.config/opencode/
```

### 6. 退出时自动清理
```bash
trap cleanup EXIT  # 删除临时目录
```

## 关键区别

| 方案 | 配置目录 | 修改影响 | 风险 |
|------|----------|----------|------|
| ❌ 旧脚本 | 直接挂载宿主 | 宿主机被污染 | 高 |
| ✅ 新脚本 | 临时隔离目录 | 只影响容器 | 无 |

## 使用方法

```bash
# 一键测试（完全隔离）
./scripts/test-isolated.sh

# 进入容器测试
docker exec -it opencode-test-isolated-XXXXX bash

# 在容器内运行（不会影响宿主机）
export OPENCODE_ANTIGRAVITY_DEBUG=2
opencode run "test" --model=google/antigravity-claude-sonnet-4-5
```

## 宿主机修复

如果你的宿主机 opencode 配置已经被污染：

```bash
# 1. 备份当前配置
cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.backup

# 2. 删除无效的 plugin 配置
# 编辑 ~/.config/opencode/opencode.json
# 移除 "plugin": ["file:///workspace"] 这一行

# 或者重置配置
rm ~/.config/opencode/opencode.json
# 然后重新配置你的 opencode
```

## 承诺

新脚本保证：
1. ✅ 不修改宿主机任何配置文件
2. ✅ 只拷贝认证信息（只读）
3. ✅ 所有测试在隔离环境进行
4. ✅ 退出后自动清理临时文件

再次为这个严重错误道歉！
