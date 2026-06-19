param(
  [ValidateSet("auto", "native", "winget", "npm")]
  [string]$Method = $env:GAL_INSTALL_METHOD,
  [string]$Version = $env:GAL_INSTALL_VERSION,
  [switch]$Force,
  [string]$InstallDir = $env:GAL_INSTALL_DIR
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Method)) {
  $Method = "auto"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = "latest"
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $InstallDir = Join-Path $env:LOCALAPPDATA "Programs\GAL\bin"
}

$baseUrl = if ($env:GAL_INSTALL_BASE_URL) { $env:GAL_INSTALL_BASE_URL } else { "https://gal.run/cli" }
$wingetId = "SchedulerSystems.GAL"

function Test-Command {
  param([string]$Name)

  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Resolve-Version {
  if ($script:Version -ne "latest") {
    return $script:Version
  }

  try {
    $resolved = (Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/LATEST").Content.Trim()
    if ($resolved) {
      $script:Version = $resolved
      return $script:Version
    }
  } catch {
  }

  return $null
}

function Get-NativeAssetUrl {
  $resolvedVersion = Resolve-Version
  if (-not $resolvedVersion) {
    return $null
  }

  return "$baseUrl/releases/$resolvedVersion/gal-$resolvedVersion-windows-x64.exe"
}

function Test-NativeAvailable {
  $assetUrl = Get-NativeAssetUrl
  if (-not $assetUrl) {
    return $false
  }

  try {
    Invoke-WebRequest -Method Head -UseBasicParsing -Uri $assetUrl | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Write-InstallMetadata {
  param(
    [string]$BinaryPath,
    [string]$ResolvedVersion
  )

  $galDir = Join-Path $HOME ".gal"
  New-Item -ItemType Directory -Force -Path $galDir | Out-Null
  $metadata = @{
    method = "native"
    binaryPath = $BinaryPath
    installedAt = [DateTime]::UtcNow.ToString("o")
    platform = "windows"
    version = $ResolvedVersion
  }
  $metadata | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $galDir "install-metadata.json")
}

function Install-Native {
  $assetUrl = Get-NativeAssetUrl
  if (-not $assetUrl) {
    throw "Native assets are not published yet at $baseUrl."
  }

  $resolvedVersion = Resolve-Version
  $tempExe = Join-Path $env:TEMP "gal-$resolvedVersion.exe"
  $targetExe = Join-Path $InstallDir "gal.exe"

  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri $assetUrl -OutFile $tempExe

  if ((Test-Path $targetExe) -and (-not $Force.IsPresent)) {
    throw "GAL is already installed at $targetExe. Re-run with -Force to replace it."
  }

  Copy-Item -Force $tempExe $targetExe
  Remove-Item -Force $tempExe
  Write-InstallMetadata -BinaryPath $targetExe -ResolvedVersion $resolvedVersion

  Write-Host "Installed GAL CLI to $targetExe"
  if (-not ($env:PATH -split ";" | Where-Object { $_ -eq $InstallDir })) {
    Write-Host ""
    Write-Host "Add this directory to PATH before using gal:"
    Write-Host "  $InstallDir"
  }
}

function Install-Winget {
  if (-not (Test-Command winget)) {
    throw "WinGet is not installed."
  }

  $subcommand = "install"
  if ($Force.IsPresent) {
    $subcommand = "upgrade"
  }

  & winget $subcommand --id $wingetId --accept-source-agreements --accept-package-agreements
}

function Install-Npm {
  if (-not (Test-Command npm)) {
    throw "npm is not installed."
  }

  & npm install -g "@scheduler-systems/gal-run@$Version"
}

if ($Method -eq "auto") {
  if (Test-NativeAvailable) {
    $Method = "native"
  } elseif (Test-Command winget) {
    $Method = "winget"
  } elseif (Test-Command npm) {
    $Method = "npm"
  } else {
    $Method = "native"
  }
}

if ($Method -eq "native" -and -not (Test-NativeAvailable)) {
  Write-Host "Native assets are not available at $baseUrl yet. Falling back to package-manager install."
  if (Test-Command winget) {
    $Method = "winget"
  } elseif (Test-Command npm) {
    $Method = "npm"
  } else {
    throw "No supported fallback installer found."
  }
}

switch ($Method) {
  "native" { Install-Native }
  "winget" { Install-Winget }
  "npm" { Install-Npm }
  default { throw "Unsupported install method: $Method" }
}
