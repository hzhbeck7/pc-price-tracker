@echo off
title PC Price Tracker
echo.
echo ============================================
echo   PC Price Tracker - Fetching prices...
echo ============================================
echo.
echo Searching JD and Taobao for latest prices.
echo Keep Chrome open and logged in.
echo.

cd /d "%~dp0"

:: Sync taobao adapter to opencli user directory
if not exist "%USERPROFILE%\.opencli\clis\taobao" (
  mkdir "%USERPROFILE%\.opencli\clis\taobao"
)
xcopy /y "adapters\taobao\search.js" "%USERPROFILE%\.opencli\clis\taobao\" >nul 2>&1

node price_checker.js

if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Script failed. See error above.
  pause
  exit /b 1
)

echo.
echo Pushing to GitHub Pages...
git add index.html data\prices.json
git commit -m "price update %DATE%"
git push

echo.
echo ============================================
echo   Done! Open on your phone:
echo   https://hzhbeck7.github.io/pc-price-tracker/
echo ============================================
echo.
pause
