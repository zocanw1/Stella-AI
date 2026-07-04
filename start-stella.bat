@echo off
setlocal
title Stella Launcher

cd /d "%~dp0"

if not exist ".env" (
    echo [ERROR] File .env tidak ditemukan.
    pause
    exit /b 1
)

:menu
cls
echo  =============================================
echo         STELLA v5 LAUNCHER
echo  =============================================
echo.
echo  1. Telegram Bot (index.js)
echo  2. Discord Bot (discord_bot.js)
echo  3. Stella CLI (Control Panel)
echo.
echo  0. Keluar
echo.
echo  =============================================
set /p choice="Pilih [1/2/3/0]: "

if "%choice%"=="1" goto telegram
if "%choice%"=="2" goto discord
if "%choice%"=="3" goto cli
if "%choice%"=="0" exit /b 0
goto menu

:telegram
for %%K in (DEEPSEEK_API_KEY TELEGRAM_TOKEN GEMINI_API_KEY GROQ_API_KEY) do (
    findstr /R /C:"^%%K=." ".env" >nul
    if errorlevel 1 (
        echo [ERROR] %%K belum terisi di .env.
        pause
        exit /b 1
    )
)
echo Menyalakan Stella Telegram Bot...
echo Folder: %cd%
echo.
:restart
node index.js
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="42" (
    echo.
    echo [RESTART] Stella restart otomatis...
    goto restart
)
echo Stella berhenti dengan kode %EXIT_CODE%.
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%

:discord
findstr /R /C:"^DISCORD_TOKEN=." ".env" >nul
if errorlevel 1 (
    echo [ERROR] DISCORD_TOKEN belum terisi di .env.
    pause
    exit /b 1
)
echo Menyalakan Stella Discord Bot...
echo Folder: %cd%
echo.
echo Tekan Ctrl+C untuk menghentikan bot.
echo.
node discord_bot.js
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
    echo Bot Discord berhenti dengan kode %EXIT_CODE%.
    pause
)
exit /b %EXIT_CODE%

:cli
echo Membuka Stella Control Panel...
start "Stella CLI" cmd /c "cd /d "%~dp0" && node cli.js repl"
exit /b 0
