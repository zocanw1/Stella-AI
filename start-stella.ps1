$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $projectRoot

Write-Host "Menjalankan Stella dari: $projectRoot"
Write-Host "Tekan Ctrl+C untuk menghentikan bot."

node index.js
