@echo off
title Stella Control Panel
cd /d "%~dp0"
echo.
echo  ====================================
echo     STELLA CONTROL PANEL
echo     Mode Interaktif (ketik /help)
echo  ====================================
echo.
node cli.js repl
pause
