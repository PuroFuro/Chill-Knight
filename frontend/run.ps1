# Frontend dev launcher (Windows PowerShell).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
    npm install
}

Write-Host "Starting Chill Knight frontend on http://localhost:5173 ..." -ForegroundColor Green
npm run dev
