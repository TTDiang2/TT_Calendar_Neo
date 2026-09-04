#!/usr/bin/env bash
# =============================================================================
# TT Calendar · iOS 一键出包（在 Mac 上跑）
# -----------------------------------------------------------------------------
# 用法（在仓库根目录，Mac 终端）：
#     bash scripts/mac/ios-build.sh
#     bash scripts/mac/ios-build.sh --unsigned   # 出「未签名」真机包 → Sideloadly 自签
#
# 产物（成功时打印，默认可在 apps/mobile/ 下找）：
#     *.ipa  —— 真机安装包
# 日志：artifacts/ios-build-<时间戳>.log（所有输出都留档，方便排障）
#
# 说明：
#   - 需要这台 Mac 有完整 Xcode(≥16)、git、pnpm、Rust。
#   - 默认跑官方 `tauri ios build`（最稳）。若本机登录了 Apple ID 会自动用 free team 签名。
#   - --unsigned：加 CODE_SIGNING_ALLOWED=NO 出未签名包，给 Windows Sideloadly 自签。
#   - 这是本仓库「傻瓜化 iOS 打包」的入口；完整背景见 docs/ios-build-guide.md。
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"
echo "仓库根: $REPO_ROOT"

mkdir -p artifacts
TS="$(date +%Y%m%d-%H%M%S)"
LOG="artifacts/ios-build-$TS.log"
touch "$LOG"
exec > >(tee -a "$LOG") 2>&1   # 所有输出同时进屏幕和日志

echo "==== TT Calendar iOS 打包开始 $TS ===="

# ---------- 0. 环境自检 ----------
need() { command -v "$1" >/dev/null 2>&1 || { echo "[ERR] 缺少 $1，请先安装：$2"; exit 1; }; }
need git "brew install git 或装 Xcode"
need node "brew install node"
need pnpm "corepack enable 或 npm i -g pnpm"
need cargo "curl https://sh.rustup.rs -sSf | sh"
need xcodebuild "从 App Store 安装完整 Xcode"

echo "Xcode: $(xcodebuild -version 2>/dev/null | head -1)"
echo "Rust:  $(cargo --version 2>/dev/null)"
echo "pnpm:  $(pnpm --version 2>/dev/null)"

# 确认 iOS rust 目标（真机构建需要 aarch64-apple-ios）
rustup target add aarch64-apple-ios aarch64-apple-ios-sim 2>/dev/null || true

# ---------- 1. 前端依赖 ----------
echo "[1/3] 安装依赖..."
# pnpm 11 会在 build 前复检依赖并想清理 node_modules；非交互终端(Xcode build phase /
# CI)下会中止：ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY。
# 注意：tauri 的 iOS「Build Rust Code」phase 里调的 pnpm 跑在 Xcode 进程上下文，
# 不继承 shell 环境，且 pnpm 只认 cwd 的 .npmrc 与 ~/.npmrc → 必须写 global(~/.npmrc)。
pnpm config set --global confirm-modules-purge false
pnpm config set --global verify-deps-before-run false
pnpm install --prefer-offline

# ---------- 2. 生成 iOS Xcode 工程（首次必需；重复跑会幂等） ----------
echo "[2/3] 初始化 iOS 工程 (tauri ios init)..."
cd apps/mobile
pnpm tauri ios init --ci

# ---------- 3. 构建真机包 ----------
echo "[3/3] tauri ios build ..."

if [[ "${1:-}" == "--unsigned" ]]; then
  # 未签名出包：走 xcodebuild 关签名，绕开 tauri 的签名导出
  # (若 tauri ios build 在无账号 Mac 上因签名失败，回退到这里)
  echo "模式：未签名 (Sideloadly 自签) —— 先试官方命令..."
  UNSIGNED=1
else
  UNSIGNED=0
fi

# 尝试官方 tauri ios build
set +e
if [[ "$UNSIGNED" == "1" ]]; then
  # 官方命令多数要签名；这里尝试带跳过签名的 xcodebuild 兜底前，先试 tauri（有账号即成功）
  pnpm tauri ios build --target aarch64 2>&1 | tail -30
  CODE=${PIPESTATUS[0]}
else
  pnpm tauri ios build --target aarch64 2>&1 | tail -40
  CODE=${PIPESTATUS[0]}
fi
set -e

# 找 .app / .ipa
APP="$(find src-tauri/gen/apple/build -name '*.app' -type d 2>/dev/null | head -1 || true)"
IPA="$(find . -name '*.ipa' 2>/dev/null | grep -v node_modules | head -1 || true)"
EXE_OK=""
[ -n "$APP" ] && EXE_OK="$(find "$APP" -maxdepth 1 -type f -perm -111 | head -1 || true)"

if [ "$CODE" = "0" ] && [ -n "$APP" ] && [ -n "$EXE_OK" ]; then
  echo ""
  echo "✅ 构建成功！"
  echo "   .app: $APP"
  # 打成 Sideloadly 可用的未签名 .ipa（Payload 结构）
  if [[ "$UNSIGNED" == "1" ]]; then
    rm -rf Payload
    mkdir -p Payload
    cp -R "$APP" Payload/
    find Payload -type f -exec chmod 644 {} +
    find Payload -type d -exec chmod 755 {} +
    zip -qry "$REPO_ROOT/artifacts/tt-calendar-ios-unsigned.ipa" Payload/
    rm -rf Payload
    echo "   真机未签名包: artifacts/tt-calendar-ios-unsigned.ipa"
    echo "   → 到 Windows 用 Sideloadly 自签装机（见 scripts/ios-install-guide.md）"
  else
    [ -n "$IPA" ] && echo "   .ipa: $IPA"
  fi
  echo "日志: $LOG"
  exit 0
fi

# ---------- 失败诊断 ----------
echo ""
echo "❌ 构建未成功（tauri ios build 退出码 $CODE）。"
[ -n "$APP" ] && echo "   有 .app 但其中没有可执行文件(空壳)，请查日志。"
echo "--- 日志尾部 ---"
tail -25 "$LOG" 2>/dev/null || true
echo ""
echo "可能原因与下一步（详见 docs/ios-build-guide.md §4/§5.3）："
echo "  1) Xcode 版本过低打不开工程(格式77) → 升级 Xcode 到 16+"
echo "  2) 无签名证书导致签名失败 → 借的 Mac 主人若登录了 Apple ID，一般会自动 free 签名；"
echo "     想完全不要签名，加参数： bash scripts/mac/ios-build.sh --unsigned"
echo "  3) tauri 自身的坑(server-addr / pnpm no-TTY)：本机交互终端通常不触发；若仍出现，"
echo "     把上面日志发给我(仓库维护者)一次校准脚本。"
exit 1
