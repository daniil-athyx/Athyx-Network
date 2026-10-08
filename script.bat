@echo off
echo ===================================================
echo   Athyx Network Multi-Deploy Script
echo ===================================================
echo.

set /p msg="Enter commit message (or press Enter for 'Auto-deploy update'): "
if "%msg%"=="" set msg=Auto-deploy update

echo.
echo [1/3] Pushing to GitHub...
git add .
git commit -m "%msg%"
git push origin main

echo.
echo [2/3] Deploying to Cloudflare Workers/Pages...
call npx wrangler deploy

echo.
echo [3/3] Deploying to Google Firebase Hosting...
call npx firebase-tools deploy

echo.
echo ===================================================
echo   All Deployments Complete! 🚀
echo ===================================================
pause
