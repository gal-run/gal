param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Path
)

$ErrorActionPreference = "Stop"

if (-not $Path -or $Path.Count -eq 0) {
  throw "At least one path is required"
}

if ($env:GITHUB_ACTIONS -ne "true") {
  Write-Host "Skipping Windows signing because this is not running on GitHub Actions"
  exit 0
}

$files = @($Path | ForEach-Object { Resolve-Path $_ -ErrorAction SilentlyContinue } | Select-Object -ExpandProperty Path -Unique)

if (-not $files -or $files.Count -eq 0) {
  throw "No files matched the requested paths"
}

function Test-AllPresent([string[]] $Values) {
  foreach ($value in $Values) {
    if ([string]::IsNullOrWhiteSpace($value)) {
      return $false
    }
  }

  return $true
}

function Invoke-AzureSigning([string[]] $Files) {
  $vars = @{
    endpoint = $env:AZURE_TRUSTED_SIGNING_ENDPOINT
    account  = $env:AZURE_TRUSTED_SIGNING_ACCOUNT_NAME
    profile  = $env:AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE
  }

  if (-not (Test-AllPresent @($vars.endpoint, $vars.account, $vars.profile))) {
    return $false
  }

  $moduleVersion = "0.5.8"
  $module = Get-Module -ListAvailable -Name TrustedSigning | Where-Object { $_.Version -eq [version] $moduleVersion }

  if (-not $module) {
    try {
      Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
    }
    catch {
      Write-Host "NuGet package provider install skipped: $($_.Exception.Message)"
    }

    Install-Module -Name TrustedSigning -RequiredVersion $moduleVersion -Force -Repository PSGallery -Scope CurrentUser
  }

  Import-Module TrustedSigning -RequiredVersion $moduleVersion -Force

  $params = @{
    Endpoint                           = $vars.endpoint
    CodeSigningAccountName             = $vars.account
    CertificateProfileName             = $vars.profile
    Files                              = ($Files -join ",")
    FileDigest                         = "SHA256"
    TimestampDigest                    = "SHA256"
    TimestampRfc3161                   = "http://timestamp.acs.microsoft.com"
    ExcludeEnvironmentCredential       = $true
    ExcludeWorkloadIdentityCredential  = $true
    ExcludeManagedIdentityCredential   = $true
    ExcludeSharedTokenCacheCredential  = $true
    ExcludeVisualStudioCredential      = $true
    ExcludeVisualStudioCodeCredential  = $true
    ExcludeAzureCliCredential          = $false
    ExcludeAzurePowerShellCredential   = $true
    ExcludeAzureDeveloperCliCredential = $true
    ExcludeInteractiveBrowserCredential = $true
  }

  Invoke-TrustedSigning @params
  return $true
}

function Get-SslTool {
  if ($env:SSL_COM_CODESIGNTOOL) {
    return (Resolve-Path $env:SSL_COM_CODESIGNTOOL).Path
  }

  $dir = Join-Path $env:RUNNER_TEMP "ssl-com-codesigntool"
  $zip = Join-Path $env:RUNNER_TEMP "ssl-com-codesigntool.zip"

  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Invoke-WebRequest -Uri "https://www.ssl.com/download/codesigntool-for-windows/" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $dir -Force
  }

  $tool = Get-ChildItem $dir -Recurse -File |
    Where-Object { $_.Name -in @("CodeSignTool.bat", "CodeSignTool.cmd", "CodeSignTool.exe") } |
    Select-Object -First 1

  if (-not $tool) {
    throw "SSL.com CodeSignTool was not found after download"
  }

  return $tool.FullName
}

function Invoke-SslSigning([string[]] $Files) {
  $vars = @{
    username   = $env:SSL_COM_USERNAME
    password   = $env:SSL_COM_PASSWORD
    credential = $env:SSL_COM_CREDENTIAL_ID
    totp       = $env:SSL_COM_TOTP_SECRET
  }

  if (-not (Test-AllPresent @($vars.username, $vars.password, $vars.credential, $vars.totp))) {
    return $false
  }

  if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw "SSL.com signing is configured but Java is not available"
  }

  $tool = Get-SslTool

  foreach ($file in $Files) {
    $out = Join-Path $env:RUNNER_TEMP "ssl-com-signed-$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Force -Path $out | Out-Null

    & $tool sign `
      "-username=$($vars.username)" `
      "-password=$($vars.password)" `
      "-credential_id=$($vars.credential)" `
      "-totp_secret=$($vars.totp)" `
      "-input_file_path=$file" `
      "-output_dir_path=$out"

    if ($LASTEXITCODE -ne 0) {
      throw "SSL.com signing failed for $file"
    }

    $signed = Join-Path $out (Split-Path $file -Leaf)
    if (-not (Test-Path $signed)) {
      throw "SSL.com signing did not produce $signed"
    }

    Move-Item -Force $signed $file
  }

  return $true
}

if (Invoke-AzureSigning $files) {
  exit 0
}

if (Invoke-SslSigning $files) {
  exit 0
}

Write-Host "Skipping Windows signing because no Windows signing provider is configured"
