@echo off
cd /d D:\Projects\lifemarkai\migration\tanstack-start-app
echo Freeing ports 3001 and 3010...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /F /PID %%a
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3010 ^| findstr LISTENING') do taskkill /F /PID %%a
netstat -aon | findstr :2375 | findstr LISTENING > nul
if errorlevel 1 (
  echo Starting docker tunnel...
  start "lm-tunnel" /min cmd /c "ssh -o StrictHostKeyChecking=accept-new -N -L 2375:/var/run/docker.sock root@187.124.118.56"
) else (
  echo Tunnel already up.
)
echo Starting AI worker...
start "lm-ai-worker" /min cmd /c "npm run dev:ai-worker > .dev-ai-worker.log 2>&1"
echo Starting vite dev...
start "lm-vite" /min cmd /c "npm run dev > .dev-vite.log 2>&1"
echo ok > .dev-started.txt
