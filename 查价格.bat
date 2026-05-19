@echo off
chcp 65001 >nul
title PC配件比价 - 查询中...
echo.
echo ============================================
echo   PC 配件比价工具
echo ============================================
echo.
echo 正在抓取京东 / 淘宝天猫最新价格...
echo 请保持 Chrome 浏览器处于登录状态，不要关闭。
echo.

cd /d "%~dp0"

:: 自动同步淘宝适配器到 opencli 用户目录（新电脑首次运行时需要）
if not exist "%USERPROFILE%\.opencli\clis\taobao" (
  mkdir "%USERPROFILE%\.opencli\clis\taobao"
)
xcopy /y "adapters\taobao\search.js" "%USERPROFILE%\.opencli\clis\taobao\" >nul 2>&1

node price_checker.js

if %errorlevel% neq 0 (
  echo.
  echo [错误] 脚本执行失败，请查看上方错误信息。
  pause
  exit /b 1
)

echo.
echo 正在推送到 GitHub Pages...
git add dashboard.html data\prices.json
git commit -m "price update %DATE% %TIME:~0,5%"
git push

echo.
echo ============================================
echo   完成！手机打开以下链接查看最新价格：
echo   https://你的GitHub用户名.github.io/pc-price-tracker/
echo ============================================
echo.
pause
