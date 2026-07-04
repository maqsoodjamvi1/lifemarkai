@echo off
REM ── LifemarkAI: apply pending migrations 074 + 075 only (no git) ──
REM Prerequisite: DATABASE_URL in .env.local
REM   (Supabase Dashboard -> Project Settings -> Database -> Connection string URI)
setlocal
cd /d "%~dp0"
node scripts\apply-migrations-074-075.js
pause
