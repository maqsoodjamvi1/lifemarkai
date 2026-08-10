@echo off
REM Apply 058 (the four element-comment columns), then re-run the drift check
REM with the fixed parser. 058 is ADD COLUMN IF NOT EXISTS / CREATE INDEX IF
REM NOT EXISTS throughout, so re-running it is safe.
setlocal
set "REPO=D:\Projects\lifemarkai"
set "LOG=%~dp0fix-058-result.txt"

> "%LOG%" 2>&1 (
  cd /d "%REPO%"
  echo === Applying 058_element_comments.sql ===
  node scripts\apply-migration.js 058
  if errorlevel 1 ( echo APPLY OR VERIFY FAILED & exit /b 1 )
  echo.
  echo === Full drift re-check with the fixed parser ===
  node scripts\check-schema-drift.js
  echo.
  echo DONE
)
endlocal
