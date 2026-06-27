param(
  [string]$ServerSource,
  [string]$LocalMirrorRoot,
  [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

function Normalize-PathText([string]$PathText) {
  return ($PathText -replace "\\", "/").TrimEnd("/")
}

function Is-RemoteSource([string]$PathText) {
  if ($PathText -match "^[A-Za-z]:[\\/]") {
    return $false
  }

  return $PathText -match "^[^:]+:.+"
}

if ([string]::IsNullOrWhiteSpace($ServerSource)) {
  Fail "ServerSource is required."
}

if ([string]::IsNullOrWhiteSpace($LocalMirrorRoot)) {
  Fail "LocalMirrorRoot is required."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$repoRootText = Normalize-PathText $repoRoot.Path
$localRootText = Normalize-PathText $LocalMirrorRoot
$sourceText = Normalize-PathText $ServerSource
$isRemote = Is-RemoteSource $ServerSource
$dryRun = -not $Apply.IsPresent

if ($localRootText -eq "" -or $localRootText -eq "." -or $localRootText -eq "/") {
  Fail "LocalMirrorRoot is not safe."
}

if ($localRootText -match "^server:" -or $localRootText -match "/var/www/vhosts" -or $localRootText -match "/httpdocs$" -and $localRootText -match "ob-gate\.com") {
  Fail "LocalMirrorRoot looks like a production server path."
}

if ($localRootText.StartsWith($repoRootText, [System.StringComparison]::OrdinalIgnoreCase)) {
  Fail "LocalMirrorRoot must be outside the Git repository."
}

if ($sourceText -eq $localRootText) {
  Fail "Source and destination must be different."
}

if ($Apply.IsPresent -and $isRemote) {
  Fail "Remote apply is not implemented in this skeleton. Use dry-run or a reviewed local download source."
}

$allowPatterns = @(
  "market_snapshot.json",
  "latest_decision.json",
  "plan_status_state.json",
  "scheduler_heartbeat.json",
  "dashboard/tmp/execution-runner/*.jsonl",
  "dashboard/tmp/trend-paper/*.jsonl",
  "dashboard/tmp/historical-packs/*.json",
  "dashboard/tmp/historical-packs/*.jsonl"
)

$denyPatterns = @(
  ".env",
  "config/db.php",
  "node_modules",
  ".next",
  "*.lock",
  "*secret*",
  "*private-key*",
  "*approval-control*",
  "*trade-control*",
  "dist",
  "build"
)

Write-Host "Mode: $([string]::Copy($(if ($dryRun) { 'DRY_RUN' } else { 'APPLY' })))"
Write-Host "Direction: SERVER -> LOCAL"
Write-Host "Source: $ServerSource"
Write-Host "LocalMirrorRoot: $LocalMirrorRoot"

if (-not $isRemote -and -not (Test-Path -LiteralPath $ServerSource)) {
  Fail "Local ServerSource path does not exist."
}

$planned = New-Object System.Collections.Generic.List[object]
$missing = New-Object System.Collections.Generic.List[string]
$forbidden = New-Object System.Collections.Generic.List[string]

foreach ($pattern in $allowPatterns) {
  if ($isRemote) {
    $planned.Add([pscustomobject]@{
      Source = "$ServerSource/$pattern"
      Destination = Join-Path $LocalMirrorRoot $pattern
      Exists = $null
    })
    continue
  }

  $sourcePattern = Join-Path $ServerSource $pattern
  $matches = Get-ChildItem -Path $sourcePattern -File -ErrorAction SilentlyContinue
  if (-not $matches) {
    $missing.Add($pattern)
    continue
  }

  foreach ($match in $matches) {
    $relative = Normalize-PathText $match.FullName
    $sourceRoot = Normalize-PathText (Resolve-Path $ServerSource).Path
    $relative = $relative.Substring($sourceRoot.Length).TrimStart("/")
    $planned.Add([pscustomobject]@{
      Source = $match.FullName
      Destination = Join-Path $LocalMirrorRoot $relative
      Exists = $true
    })
  }
}

if (-not $isRemote) {
  foreach ($pattern in $denyPatterns) {
    $matches = Get-ChildItem -Path (Join-Path $ServerSource $pattern) -Force -ErrorAction SilentlyContinue
    foreach ($match in $matches) {
      $forbidden.Add($match.FullName)
    }
  }
}

Write-Host ""
Write-Host "Planned allowlisted operations:"
foreach ($item in $planned) {
  Write-Host "PULL $($item.Source) -> $($item.Destination)"
}

if ($missing.Count -gt 0) {
  Write-Host ""
  Write-Host "Missing optional allowlisted files:"
  foreach ($item in $missing) {
    Write-Host $item
  }
}

if ($forbidden.Count -gt 0) {
  Write-Host ""
  Write-Host "Forbidden path matches detected:"
  foreach ($item in $forbidden) {
    Write-Host $item
  }
}

if ($forbidden.Count -gt 0 -and $Apply.IsPresent) {
  Fail "Forbidden path matches detected. Stopping before copy."
}

if ($dryRun) {
  Write-Host ""
  Write-Host "Dry-run only. No files copied and no status file written."
  exit 0
}

if (-not (Test-Path -LiteralPath $LocalMirrorRoot)) {
  New-Item -ItemType Directory -Path $LocalMirrorRoot | Out-Null
}

$mirrored = New-Object System.Collections.Generic.List[string]
foreach ($item in $planned) {
  $destination = $item.Destination
  $destinationText = Normalize-PathText $destination
  if (-not $destinationText.StartsWith($localRootText, [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail "Destination escapes LocalMirrorRoot."
  }

  $destinationDir = Split-Path -Parent $destination
  if (-not (Test-Path -LiteralPath $destinationDir)) {
    New-Item -ItemType Directory -Path $destinationDir | Out-Null
  }

  Copy-Item -LiteralPath $item.Source -Destination $destination -Force
  Set-ItemProperty -LiteralPath $destination -Name IsReadOnly -Value $true
  $mirrored.Add($destination)
}

$status = [pscustomobject]@{
  source = "LOCAL_RESEARCH_MIRROR_V1"
  mode = "PULL_ONLY"
  lastSyncAt = (Get-Date).ToUniversalTime().ToString("o")
  mirrorAgeMs = 0
  status = "FRESH"
  filesMirrored = @($mirrored)
  filesMissing = @($missing)
  forbiddenFilesDetected = @($forbidden)
  nextAction = "Review local mirror freshness and build a local replay input pack only when separately approved."
  activationAllowed = $false
  paperActivationAllowed = $false
  liveActivationAllowed = $false
  reviewOnly = $true
  shadowOnly = $true
}

$statusPath = Join-Path $LocalMirrorRoot "localMirrorStatus.json"
$status | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding UTF8
Set-ItemProperty -LiteralPath $statusPath -Name IsReadOnly -Value $true

Write-Host ""
Write-Host "Mirror status written locally: $statusPath"
