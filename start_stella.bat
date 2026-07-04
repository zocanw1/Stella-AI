@echo off
chcp 65001 >nul
echo ====================================
echo     START STELLA SERVER
echo ====================================
echo.
python stella_control.py start
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUKSES] Stella Server sudah jalan!
) else (
    echo.
    echo [GAGAL] Cek koneksi atau server.
)
echo.
pause
