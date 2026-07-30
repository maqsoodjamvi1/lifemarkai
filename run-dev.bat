@echo off
title LifemarkAI dev server
cd /d D:\Projects\lifemarkai
echo Freeing port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a
if exist .next\dev rmdir /s /q .next\dev
timeout /t 2 /nobreak >nul
echo Starting LifemarkAI dev server... logging to dev-server.log
call npm run dev > dev-server.log 2>&1
echo Server exited. See dev-server.log
pause
