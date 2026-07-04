@echo off
chcp 65001 >nul
echo ====================================
echo     STOP STELLA SERVER
echo ====================================
echo.
python stella_control.py stop
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUKSES] Stella Server sudah berhenti!
) else (
    echo.
    echo [GAGAL] Cek koneksi atau server.
)
echo.
pause
