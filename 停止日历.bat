@echo off
chcp 65001 >nul
setlocal

echo ==========================================
echo    TT Calendar Neo - 停止服务
echo ==========================================
echo.

set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8766 :5173" ^| findstr "LISTENING"') do (
  echo 正在停止进程 %%P ...
  taskkill /PID %%P /F >nul 2>&1
  set "FOUND=1"
)

if not defined FOUND (
  echo 没有发现正在运行的服务。
) else (
  echo.
  echo 已全部停止。可以关掉这个窗口了。
)

echo.
echo 提示：平时直接关闭那个黑窗口即可停止。
echo 只有在提示"端口被占用"时，才需要用本脚本。
echo.
timeout /t 5 >nul
