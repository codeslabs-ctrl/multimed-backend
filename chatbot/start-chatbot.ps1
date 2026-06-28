# Levantar el chatbot (Deno) - DemoMed
# Requisitos: Deno instalado (https://deno.land/)
# Desde la raíz del backend: .\chatbot\start-chatbot.ps1
# O desde esta carpeta: .\start-chatbot.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Get-Command deno -ErrorAction SilentlyContinue)) {
    Write-Host "Deno no está instalado. Instálalo desde https://deno.land/" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path ".env")) {
    Write-Host "No existe .env en la carpeta chatbot. Copia .env.example a .env y configura PORT, BACKEND_URL y AI_PROVIDER." -ForegroundColor Yellow
}

Write-Host "Iniciando chatbot DemoMed en: $scriptDir" -ForegroundColor Cyan
Write-Host "Puerto y BACKEND_URL se leen de .env (ej. PORT=3999, BACKEND_URL=http://localhost:3006/api/v1)" -ForegroundColor Gray
Write-Host ""

deno run --allow-net --allow-env --allow-read server.ts
