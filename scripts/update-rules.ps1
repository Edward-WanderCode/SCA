$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
$openGrepDir = Join-Path $root "OpenGrep"
$trivyDir = Join-Path $root "Trivy"
$trivyCacheDir = Join-Path $trivyDir "cache"

Write-Host "----------------------------------------"
Write-Host "SCA Rules Update (Offline Preparation)"
Write-Host "----------------------------------------"

# 1. OpenGrep Rules
Write-Host "`n[1/2] Updating OpenGrep Rules..."
$rulesCacheDir = Join-Path $openGrepDir ".rules-cache"
$rulesDeployDir = Join-Path $openGrepDir "rules"

# 1a. Clone/Pull to Cache
if (-not (Test-Path $rulesCacheDir)) { New-Item -ItemType Directory -Force -Path $rulesCacheDir | Out-Null }

if (Test-Path "$rulesCacheDir\.git") {
    Write-Host "   Pulling latest changes in cache..."
    try {
        git -C $rulesCacheDir -c safe.directory=* pull
        Write-Host "   ✅ Rules cache updated."
    } catch {
        Write-Warning "   ⚠️ Git pull failed: $_"
    }
} else {
    Write-Host "   Cloning opengrep-rules to cache..."
    # Clean cache dir if it has non-git content
    if ((Get-ChildItem $rulesCacheDir).Count -gt 0) {
        Remove-Item "$rulesCacheDir\*" -Recurse -Force
    }
    
    try {
        git clone --depth 1 https://github.com/opengrep/opengrep-rules $rulesCacheDir
        Write-Host "   ✅ Rules cache cloned."
    } catch {
       Write-Warning "   ⚠️ Git clone failed. Check internet connection."
       exit
    }
}

# 1b. Deploy to Production Rules Dir
Write-Host "   Deploying clean rules to $rulesDeployDir..."
if (Test-Path $rulesDeployDir) { Remove-Item $rulesDeployDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $rulesDeployDir | Out-Null

# Filter unwanted folders/files
$excludeList = @(".git", ".github", ".gitignore", "stats", "tests", "scripts", "Makefile", "LICENSE", "*.md", "Pipfile*")

$items = Get-ChildItem $rulesCacheDir -Exclude $excludeList
foreach ($item in $items) {
    # Skip items starting with dot (hidden)
    if ($item.Name.StartsWith(".")) { continue }
    
    # Logic: Only copy directories (rule packs) or YAML files
    if ($item.PSIsContainer) {
        Write-Host "   -> Copying rule pack: $($item.Name)"
        Copy-Item -Path $item.FullName -Destination "$rulesDeployDir\$($item.Name)" -Recurse -Force
    } elseif ($item.Extension -in ".yaml", ".yml") {
         # Double check if it looks like a rule file
         $content = Get-Content $item.FullName -TotalCount 50
         if ($content -match "rules:") {
             Copy-Item -Path $item.FullName -Destination "$rulesDeployDir\$($item.Name)" -Force
         }
    }
}
Write-Host "   ✅ OpenGrep rules deployed successfully."


# 2. Trivy DB
Write-Host "`n[2/2] Updating Trivy Database..."
$trivyExe = Join-Path $trivyDir "trivy.exe"
if (Test-Path $trivyExe) {
    if (-not (Test-Path $trivyCacheDir)) { New-Item -ItemType Directory -Force -Path $trivyCacheDir | Out-Null }
    
    Write-Host "   Downloading Trivy DB to $trivyCacheDir..."
    try {
        # Download Vulnerability DB
        & $trivyExe image --download-db-only --cache-dir $trivyCacheDir --quiet
        
        # Download Java DB
        & $trivyExe image --download-java-db-only --cache-dir $trivyCacheDir --quiet
        
        Write-Host "   ✅ Trivy DB updated."
    } catch {
        Write-Warning "   ⚠️ Trivy DB update failed: $_"
    }
} else {
    Write-Warning "   ❌ Trivy binary not found. Run 'npm run setup' first."
}

Write-Host "`n----------------------------------------"
Write-Host "Update Complete."
