$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
  throw 'Python 3.10+ is required. Install Python from python.org and retry.'
}

py -3 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt

if (-not $env:NEOFL_MT5_MCP_TOKEN) {
  Write-Warning 'NEOFL_MT5_MCP_TOKEN is not set. The MCP server will be local-only unless you set a token and bind it beyond localhost.'
}

& .\.venv\Scripts\python.exe server.py
