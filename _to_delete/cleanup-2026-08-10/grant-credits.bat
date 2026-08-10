@echo off
REM Give maqsoodjamvi@gmail.com effectively-unlimited credits for testing.
REM Double-click this file. Output lands in grant-credits-result.txt.
setlocal
set "HERE=%~dp0"
set "LOG=%HERE%grant-credits-result.txt"
set "SCRIPT=%HERE%grant-unlimited-credits.js"

> "%LOG%" 2>&1 (
  echo === LifemarkAI: grant unlimited test credits ===
  if not exist "%SCRIPT%" (
    echo ERROR: grant-unlimited-credits.js is missing from %HERE%
    exit /b 1
  )
  if not exist "%HERE%.env.local" (
    echo ERROR: .env.local not found in %HERE% - the script reads DB credentials from it.
    exit /b 1
  )

  cd /d "%HERE%"
  echo Running...
  echo.
  node "%SCRIPT%" maqsoodjamvi@gmail.com
  if errorlevel 1 (
    echo.
    echo === FAILED - see the error above ===
    exit /b 1
  )
  echo.
  echo === DONE_OK ===
)

REM Show the result on screen too, so a double-click isn't silent.
type "%LOG%"
echo.
echo ---------------------------------------------
echo Full output also saved to grant-credits-result.txt
pause
endlocal
