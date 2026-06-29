param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputPath = Join-Path (Split-Path $projectRoot -Parent) "kiki-miki-anniversary-clean-$stamp.zip"
}

$temp = Join-Path $env:TEMP ("kiki-miki-clean-" + [guid]::NewGuid().ToString("N"))
$copyRoot = Join-Path $temp "kiki-miki-anniversary"

New-Item -ItemType Directory -Path $copyRoot -Force | Out-Null

$excludedDirectories = @(
  ".git",
  ".firebase",
  "node_modules",
  "functions\node_modules"
)

$excludedFiles = @(
  "*.log",
  "firebase-debug.log",
  "firebase-debug.*.log",
  "*.zip"
)

try {
  Get-ChildItem -LiteralPath $projectRoot -Force | ForEach-Object {
    $relative = $_.Name

    if ($excludedDirectories -contains $relative) {
      return
    }

    if ($_.PSIsContainer) {
      Copy-Item $_.FullName (Join-Path $copyRoot $relative) -Recurse -Force
    } else {
      $skip = $false
      foreach ($pattern in $excludedFiles) {
        if ($_.Name -like $pattern) {
          $skip = $true
          break
        }
      }
      if (-not $skip) {
        Copy-Item $_.FullName (Join-Path $copyRoot $relative) -Force
      }
    }
  }

  Remove-Item (Join-Path $copyRoot "functions\node_modules") -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path $copyRoot -DestinationPath $OutputPath -CompressionLevel Optimal
  Write-Host "Clean ZIP created: $OutputPath" -ForegroundColor Green
} finally {
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
