@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ==========================================
echo    TT Calendar Neo - 一键启动
echo ==========================================
echo.

REM ---------- 0. 是否已经在运行 ----------
set "PORT_BUSY="
netstat -ano | findstr ":8766" | findstr "LISTENING" >nul
if not errorlevel 1 set "PORT_BUSY=1"
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if not errorlevel 1 set "PORT_BUSY=1"

if defined PORT_BUSY (
  echo [提示] 日历服务已经在运行了，直接帮你打开浏览器。
  echo.
  start http://localhost:5173
  echo   网址： http://localhost:5173
  echo.
  echo   若要重新启动：先关掉之前那个黑窗口，再双击本脚本。
  echo.
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
  echo [错误] 没找到 Node.js。
  echo 请先安装 Node 22 或更高版本： https://nodejs.org
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
  echo [错误] 没找到 pnpm。
  echo 解决办法：打开 PowerShell，执行一次
  echo   npm install -g pnpm
  echo 然后重新双击本脚本。
  echo.
  pause
  exit /b 1
)

echo 使用 pnpm: %PNPM%
echo.

REM ---------- 3. 依赖检查 ----------
if not exist "node_modules" (
  echo 首次运行，正在安装依赖，请耐心等几分钟...
  echo.
  if "%PNPM%"=="corepack pnpm" ( call corepack pnpm install ) else ( call "%PNPM%" install )
  if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败。请把上面的红色报错发给我。
    echo.
    pause
    exit /b 1
  )
  echo.
  echo 依赖安装完成。
  echo.
)

REM ---------- 4. 数据文件检查 ----------
if not exist "data\calendar.db" (
  echo [提示] 没找到 data\calendar.db 数据文件。
  echo 应用仍能启动，但日历可能是空的。
  echo.
)

REM ---------- 5. 等服务起来后自动开浏览器 ----------
start "" /b cmd /c "timeout /t 10 >nul & start http://localhost:5173"

echo ==========================================
echo   正在启动，请稍候几秒...
echo.
echo     网页界面： http://localhost:5173
echo     数据服务： http://127.0.0.1:8766
echo.
echo   浏览器会自动打开。若没开，手动访问上面的网址。
echo   要停止：关闭这个黑窗口，或按 Ctrl+C
echo ==========================================
echo.

if "%PNPM%"=="corepack pnpm" (
  call corepack pnpm --filter @tt-calendar/web dev:all
) else (
  call "%PNPM%" --filter @tt-calendar/web dev:all
)

echo.
echo 服务已停止。
pause
