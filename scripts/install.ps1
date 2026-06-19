# GAL CLI Installer / Updater for Windows
# Usage: iwr -useb https://gal.run/install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host "GAL CLI Installer" -ForegroundColor Cyan
Write-Host ""

# Check for Node.js
try {
    $nodeVersion = node -v
    $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($majorVersion -lt 18) {
        Write-Host "Error: Node.js 18+ required. Found: $nodeVersion" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error: Node.js is required but not installed." -ForegroundColor Red
    Write-Host "Install Node.js from: https://nodejs.org/"
    exit 1
}

if (Get-Command gal -ErrorAction SilentlyContinue) {
    Write-Host "Updating GAL CLI..."
} else {
    Write-Host "Installing GAL CLI..."
}
npm install -g @scheduler-systems/gal-run

# Verify installation
try {
    $galVersion = gal --version
    Write-Host ""
    Write-Host "GAL CLI installed successfully!" -ForegroundColor Green
    Write-Host $galVersion
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  gal scan              # Discover local AI agent configs"
    Write-Host "  gal approve --local   # Standardize into ~/.gal/config.yaml"
    Write-Host "  gal sync              # Distribute to your coding agents"
    Write-Host ""
    Write-Host "Optional org sync:"
    Write-Host "  gal auth login        # Authenticate with GitHub"
    Write-Host "  gal sync --pull       # Pull org-approved config"
    Write-Host ""
    Write-Host "Update later:"
    Write-Host "  gal update"
} catch {
    Write-Host "Installation may require a new terminal window." -ForegroundColor Yellow
}
