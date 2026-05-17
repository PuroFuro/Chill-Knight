# Backend dev launcher (Windows PowerShell).
# Creates a venv on first run, installs deps, then starts the API + game loop.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Cyan
    python -m venv .venv
}

& ".venv\Scripts\python.exe" -m pip install --upgrade pip | Out-Null
& ".venv\Scripts\python.exe" -m pip install -r requirements.txt

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created backend/.env from template (SQLite by default)." -ForegroundColor Yellow
}

Write-Host "Starting Chill Knight backend on http://localhost:8000 ..." -ForegroundColor Green
& ".venv\Scripts\python.exe" -m uvicorn app.main:app --reload --port 8000
