@echo off
setlocal

cd /d "%~dp0"

if not exist ".env" (
    echo [ERROR] File .env tidak ditemukan.
    echo Buat .env lalu isi DISCORD_TOKEN sebelum menyalakan Discord bot.
    pause
    exit /b 1
)

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
    echo.
    echo Bot Discord berhenti dengan kode %EXIT_CODE%.
    pause
)

exit /b %EXIT_CODE%
