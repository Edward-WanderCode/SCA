$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
$openGrepDir = Join-Path $root "OpenGrep"
$trivyDir = Join-Path $root "Trivy"

function Get-GitHubLatestReleaseAsset {
    param (
        [string]$Repo,
        [string]$Pattern
    )
    $url = "https://api.github.com/repos/$Repo/releases/latest"
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -Headers @{"User-Agent"="PowerShell-Script"}
        $asset = $response.assets | Where-Object { $_.name -match $Pattern } | Select-Object -First 1
        return $asset
    } catch {
        Write-Warning "Failed to fetch release info for $Repo : $_"
        return $null
    }
}

Write-Host "----------------------------------------"
Write-Host "SCA Engine Setup (Offline Preparation)"
Write-Host "----------------------------------------"

# 1. OpenGrep Setup
Write-Host "`n[1/2] Checking OpenGrep..."
if (-not (Test-Path "$openGrepDir\opengrep.exe")) {
    Write-Host "   Binary not found. Attempting to download..."
    New-Item -ItemType Directory -Force -Path $openGrepDir | Out-Null
    
    # Try multiple patterns for OpenGrep (naming might vary)
    # Found in v1.14.0: opengrep_windows_x86.exe
    $asset = Get-GitHubLatestReleaseAsset -Repo "opengrep/opengrep" -Pattern "opengrep_windows_x86\.exe|windows.*amd64\.exe"
    
    if ($asset) {
        Write-Host "   Found version: $($asset.name)"
        Write-Host "   Downloading to $openGrepDir\opengrep.exe..."
        try {
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile "$openGrepDir\opengrep.exe"
            Write-Host "   ✅ OpenGrep installed successfully."
        } catch {
            Write-Error "   ❌ Download failed: $_"
        }
    } else {
        Write-Warning "   ❌ Could not find compatible OpenGrep Windows binary."
        Write-Warning "   Please download manually from: https://github.com/opengrep/opengrep/releases"
        Write-Warning "   And name it 'opengrep.exe' in the 'OpenGrep' folder."
    }
} else {
    Write-Host "   ✅ OpenGrep is already installed."
}

# 2. Trivy Setup
Write-Host "`n[2/2] Checking Trivy..."
if (-not (Test-Path "$trivyDir\trivy.exe")) {
    Write-Host "   Binary not found. Attempting to download..."
    New-Item -ItemType Directory -Force -Path $trivyDir | Out-Null
    
    $asset = Get-GitHubLatestReleaseAsset -Repo "aquasecurity/trivy" -Pattern "windows-64bit\.zip"
    
    if ($asset) {
         Write-Host "   Found version: $($asset.name)"
         $zip = "$trivyDir\temp.zip"
         Write-Host "   Downloading..."
         try {
             Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
             
             Write-Host "   Extracting..."
             Expand-Archive $zip -DestinationPath $trivyDir -Force
             
             $exe = Get-ChildItem $trivyDir -Recurse -Filter "trivy.exe" | Select-Object -First 1
             if ($exe) {
                 Move-Item $exe.FullName "$trivyDir\trivy.exe" -Force
                 Write-Host "   ✅ Trivy installed successfully."
             } else {
                 Write-Error "   ❌ trivy.exe not found in the downloaded archive."
             }
         } catch {
             Write-Error "   ❌ Download/Extraction failed: $_"
         } finally {
             # Cleanup
             if (Test-Path $zip) { Remove-Item $zip -Force }
             # Cleanup subdirs from extraction if any
             Get-ChildItem $trivyDir -Directory | Where-Object { $_.Name -ne "cache" } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
         }
    } else {
        Write-Warning "   ❌ Could not find Trivy Windows binary."
        Write-Warning "   Please download manually from: https://github.com/aquasecurity/trivy/releases"
    }
} else {
    Write-Host "   ✅ Trivy is already installed."
}

# 3. TruffleHog Setup
Write-Host "`n[3/3] Checking TruffleHog..."
$truffleHogDir = Join-Path $root "TruffleHog"
if (-not (Test-Path "$truffleHogDir\trufflehog.exe")) {
    Write-Host "   Binary not found. Attempting to download..."
    New-Item -ItemType Directory -Force -Path $truffleHogDir | Out-Null
    
    $asset = Get-GitHubLatestReleaseAsset -Repo "trufflesecurity/trufflehog" -Pattern "windows_amd64\.tar\.gz"
    
    if ($asset) {
         Write-Host "   Found version: $($asset.name)"
         $archive = "$truffleHogDir\temp.tar.gz"
         Write-Host "   Downloading..."
         try {
             Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $archive
             
             Write-Host "   Extracting..."
             # Windows 10+ has tar
             tar -xf $archive -C $truffleHogDir
             
             if (Test-Path "$truffleHogDir\trufflehog.exe") {
                 Write-Host "   ✅ TruffleHog installed successfully."
             } else {
                 Write-Error "   ❌ trufflehog.exe not found in the downloaded archive."
             }
         } catch {
             Write-Error "   ❌ Download/Extraction failed: $_"
         } finally {
             # Cleanup
             if (Test-Path $archive) { Remove-Item $archive -Force }
         }
    } else {
        Write-Warning "   ❌ Could not find TruffleHog Windows binary."
        Write-Warning "   Please download manually from: https://github.com/trufflesecurity/trufflehog/releases"
    }
} else {
    Write-Host "   ✅ TruffleHog is already installed."
}

Write-Host "`n----------------------------------------"
Write-Host "Setup Complete."
