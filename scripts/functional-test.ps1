$ErrorActionPreference = "Stop"

$hostName = $env:ZSSH_TEST_HOST
$userName = $env:ZSSH_TEST_USER
$password = $env:ZSSH_TEST_PASSWORD
$port = $env:ZSSH_TEST_PORT
$mode = $env:ZSSH_TEST_MODE

if (-not $hostName) { throw "missing env: ZSSH_TEST_HOST" }
if (-not $userName) { throw "missing env: ZSSH_TEST_USER" }
if (-not $password) { throw "missing env: ZSSH_TEST_PASSWORD" }

if (-not $port) { $port = "22" }
if (-not $mode) { $mode = "all" }

Write-Host ("[zssh-func-test] host={0} user={1} port={2} mode={3}" -f $hostName, $userName, $port, $mode)

Push-Location (Join-Path $PSScriptRoot "..\src-tauri")
try {
  $env:ZSSH_TEST_PORT = $port
  $env:ZSSH_TEST_MODE = $mode
  Stop-Process -Name "zssh_func_test" -Force -ErrorAction SilentlyContinue
  $targetDir = Join-Path $env:TEMP "zssh_func_test_target"
  $env:RUST_BACKTRACE = "1"
  cargo run --bin zssh_func_test --target-dir $targetDir
} finally {
  Pop-Location
}
