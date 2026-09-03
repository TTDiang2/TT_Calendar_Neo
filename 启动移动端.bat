@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ==========================================
echo    TT Calendar Neo - 移动端预览启动
echo ==========================================
echo.

REM ---------- 0. 状态检测：都在跑就别重启，直接开浏览器 ----------
set "MOB_UP="
set "MDATA_UP="
netstat -ano | findstr ":5175" | findstr "LISTENING" >nul && set "MOB_UP=1"
netstat -ano | findstr ":8769" | findstr "LISTENING" >nul && set "MDATA_UP=1"
if defined MOB_UP if defined MDATA_UP (
  echo [提示] 移动端预览已在运行，直接打开浏览器。
  start http://localhost:5175
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

REM ---------- 3. 清掉移动端专属端口残留 ----------
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5175 " ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8769 " ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
timeout /t 1 >nul

REM ---------- 4. 起移动端数据服务（8769，借 web 包的 tsx 跑 server.ts）----------
start "" /b cmd /c "%PNPM% --filter @tt-calendar/web exec tsx server.ts --port 8769 > mobile-data.log 2>&1"
echo 数据服务启动中（端口 8769）...

REM ---------- 5. 起移动端前端预览（5175），并自动开浏览器 ----------
echo.
echo ==========================================
echo   正在启动移动端预览，请稍候...
echo   浏览器会自动打开： http://localhost:5175
echo   这是「手机视口」的预览；想看真机/模拟器效果，需先装好
echo   Android Studio 或 Xcode，再跑： pnpm tauri android dev / ios dev
echo   要停止：关闭这个黑窗口，或按 Ctrl+C
echo ==========================================
echo.

start "" /b cmd /c "timeout /t 8 >nul & start http://localhost:5175"

if "%PNPM%"=="corepack pnpm" (
  call corepack pnpm --filter @tt-calendar/mobile dev
) else (
  call "%PNPM%" --filter @tt-calendar/mobile dev
)

REM ---------- 6. 退出后关掉数据服务 ----------
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8769 " ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
echo.
echo 移动端预览已停止。
pause
