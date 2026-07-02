@echo off
REM ── LifemarkAI: type-check → commit → push → apply migrations 074+075 ──
REM Created July 2 2026. Run from the project root (double-click works).
setlocal
cd /d "%~dp0"

echo.
echo [1/4] Type-checking...
call npm run type-check
if errorlevel 1 (
  echo.
  echo Type-check FAILED — nothing was committed. Fix the errors above first.
  pause
  exit /b 1
)

echo.
echo [2/4] Committing...
git add -A
git commit -m "July 2: unified billing (074), self-healing (075), Lovable-parity gaps, editor intelligence P1/P2, model tier lineup, editor/chat/preview debug pass"
if errorlevel 1 echo (Nothing to commit or commit failed - continuing)

echo.
echo [3/4] Pushing...
git push
if errorlevel 1 (
  echo.
  echo Push failed — check your remote/SSH key, then run: git push
  pause
  exit /b 1
)

echo.
echo [4/4] Applying migrations 074 + 075...
node scripts\apply-migrations-074-075.js
if errorlevel 1 (
  echo.
  echo Migration step needs DATABASE_URL in .env.local — see the message above.
  pause
  exit /b 2
)

echo.
echo All done: pushed + migrated.
pause
