@echo off
setlocal

cd /d "%~dp0"

if not exist ".env" (
    echo [ERROR] File .env tidak ditemukan.
    echo Buat .env lalu isi DEEPSEEK_API_KEY, TELEGRAM_TOKEN, GEMINI_API_KEY, dan GROQ_API_KEY sebelum menyalakan Stella.
    pause
    exit /b 1
)

for %%K in (DEEPSEEK_API_KEY TELEGRAM_TOKEN GEMINI_API_KEY GROQ_API_KEY) do (
    findstr /R /C:"^%%K=." ".env" >nul
    if errorlevel 1 (
        echo [ERROR] %%K belum terisi di .env.
        pause
        exit /b 1
    )
)

echo Menyalakan Stella Telegram dengan DeepSeek...
echo Folder: %cd%
echo.
echo Membuka Stella Control Panel di jendela baru...
start "Stella Control Panel" cmd /c "cd /d "%~dp0" && node cli.js repl"
echo.
echo Tekan Ctrl+C untuk menghentikan bot.
echo.

:restart
node index.js
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="42" (
    echo.
    echo [RESTART] Stella restart otomatis...
    echo.
    goto restart
)
echo.
echo Stella berhenti dengan kode %EXIT_CODE%.
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
