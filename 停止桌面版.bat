@echo off
chcp 65001 >nul
setlocal

echo 正在停止桌面端（端口 5174 / 8767）...
echo.

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5174 " ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8767 " ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>&1

echo 已停止桌面端。
echo.
pause
