@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ==========================================
echo    TT Calendar Neo - 桌面端启动
echo ==========================================
echo.

REM ---------- 0. 状态检测：都在跑就别重启，直接提示 ----------
set "DESK_UP="
set "DDATA_UP="
netstat -ano | findstr ":5174" | findstr "LISTENING" >nul && set "DESK_UP=1"
netstat -ano | findstr ":8767" | findstr "LISTENING" >nul && set "DDATA_UP=1"
if defined DESK_UP if defined DDATA_UP (
  echo [提示] 桌面端已在运行，请查看已弹出的原生窗口。
  echo   若要重新启动：先关掉原生窗口和这个黑窗口，再双击本脚本。
  timeout /t 6 >nul
  exit /b 0
)

REM ---------- 1. 找到 Node ----------
set "NODE_DIR="
for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
  if not defined NODE_DIR if exist "%%~D\node.exe" set "NODE_DIR=%%~D"
)
if not defined NODE_DIR if exist "C:\Program Files\nodejs\node.exe" (
  set "NODE_DIR=C:\Program Files\nodejs"
)
if not defined NODE_DIR (
  echo [错误] 没找到 Node.js。请安装 Node 22 或更高版本： https://nodejs.org
  echo.
  pause
  exit /b 1
)
set "PATH=%NODE_DIR%;%PATH%"
echo 使用 Node: %NODE_DIR%
"%NODE_DIR%\node.exe" -v

REM ---------- 2. 找到 pnpm ----------
set "PNPM="
where pnpm >nul 2>&1
if not errorlevel 1 set "PNPM=pnpm"
if not defined PNPM if exist "%NODE_DIR%\pnpm.CMD" set "PNPM=%NODE_DIR%\pnpm.CMD"
if not defined PNPM (
  where corepack >nul 2>&1
  if not errorlevel 1 set "PNPM=corepack pnpm"
)
if not defined PNPM (
  echo [错误] 没找到 pnpm。请运行一次： npm install -g pnpm
  echo.
  pause
  exit /b 1
)
echo 使用 pnpm: %PNPM%
echo.

REM ---------- 3. 清掉桌面专属端口残留（Tauri 用 strictPort，被占会直接失败）----------
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5174 " ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8767 " ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
timeout /t 1 >nul

REM ---------- 4. 起桌面数据服务（8767，借 web 包的 tsx 跑 server.ts；输出进日志）----------
start "" /b cmd /c "%PNPM% --filter @tt-calendar/web exec tsx server.ts --port 8767 > desktop-data.log 2>&1"
echo 数据服务启动中（端口 8767）...

REM ---------- 5. 跑 Tauri（弹原生窗口；Rust 已编译过则秒开）----------
echo.
echo ==========================================
echo   正在启动桌面应用，请稍候...
echo   原生窗口会自动弹出。若没弹，请看本窗口的红色报错。
echo   要停止：关闭原生窗口，或关掉这个黑窗口。
echo ==========================================
echo.

if "%PNPM%"=="corepack pnpm" (
  call corepack pnpm tauri dev
) else (
  call "%PNPM%" tauri dev
)

REM ---------- 6. 应用退出后，顺手关掉数据服务 ----------
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8767 " ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
echo.
echo 桌面应用已退出。
pause
