#!/usr/bin/env bash
# =============================================================================
# TT Calendar · 清理借用 Mac 的影响（跑完 iOS 打包后用）
# -----------------------------------------------------------------------------
# 用途：把「为构建 iOS 而在这台 Mac 上产生的东西」清干净，尽量还人家一台
#       干净的机器。不会碰 Mac 上别的东西，不会卸载 Xcode。
#
# 用法（在仓库根目录）：
#     bash scripts/mac/ios-cleanup.sh
#     可选：bash scripts/mac/ios-cleanup.sh --purge-cargo  # 连 ~/.cargo 里本项目装的 iOS 目标也删
#
# 注意：删除前会打印清单并等 5 秒，Ctrl-C 可取消。
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"
echo "仓库根: $REPO_ROOT"
echo "本脚本将删除以下「为构建 iOS 产生的」内容，5 秒后执行（Ctrl-C 可取消）："

to_remove=(
  "$REPO_ROOT/node_modules"                    # 依赖
  "$REPO_ROOT/apps/*/node_modules"
  "$REPO_ROOT/apps/*/dist"                     # 前端构建产物
  "$REPO_ROOT/apps/*/src-tauri/gen"            # Xcode 工程（tauri ios init 生成，不入库）
  "$REPO_ROOT/apps/*/src-tauri/target"         # Rust 编译缓存（很大）
  "$REPO_ROOT/artifacts"                       # 本工具产出
)
for p in "${to_remove[@]}"; do
  for f in $p; do
    [ -e "$f" ] && echo "  - $f"
  done
done
echo "  - Xcode DerivedData 里 tt-calendar 相关缓存"

sleep 5

# ---------- 删除仓库内残留 ----------
echo "删除中..."
for p in "${to_remove[@]}"; do
  for f in $p; do
    [ -e "$f" ] && rm -rf "$f" && echo "  删: $f"
  done
done

# ---------- Xcode DerivedData ----------
find ~/Library/Developer/Xcode/DerivedData -maxdepth 1 -iname "tt-calendar*" -exec rm -rf {} + 2>/dev/null \
  && echo "  已清理 DerivedData 里 tt-calendar 相关"

# ---------- 可选的 cargo iOS 目标清理 ----------
if [[ "${1:-}" == "--purge-cargo" ]]; then
  echo "清理 ~/.cargo 的 iOS 目标（仅删本机为编译 iOS 加的目标，不影响默认工具链）："
  rustup target remove aarch64-apple-ios aarch64-apple-ios-sim 2>/dev/null || echo "  (目标已不存在，跳过)"
else
  echo ""
  echo "提示：若想连 ~/.cargo 里为本项目装的 iOS 目标也删（可选），可再跑一次："
  echo "    bash scripts/mac/ios-cleanup.sh --purge-cargo"
fi

echo ""
echo "✅ 清理完成。"
echo "可选的收尾（你手动确认后执行，涉及系统级改动）："
echo "    brew list xcodegen >/dev/null 2>&1 && brew uninstall xcodegen   # 若 tauri 帮装过 xcodegen"
echo "最后把整个仓库目录删掉即可（它只是 clone 出来的工作区）。Xcode 本体无需动。"
