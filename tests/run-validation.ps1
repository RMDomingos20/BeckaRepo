param(
    [switch]$Build,
    [string]$OutputDirectory = 'target/validation/latest'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $repositoryRoot
try {
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
    $outputRoot = (Resolve-Path -LiteralPath $OutputDirectory).Path
    function Invoke-Logged {
        param([string]$File, [string[]]$CommandArgs, [string]$Log)
        # Windows PowerShell treats native stderr as an ErrorRecord even for Cargo progress.
        $ErrorActionPreference = 'Continue'
        & $File @CommandArgs 2>&1 | Tee-Object -FilePath (Join-Path $outputRoot $Log)
        if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE; see $Log" }
    }
    Invoke-Logged 'cargo' @('fmt', '--all', '--', '--check') 'format.log'
    Invoke-Logged 'cargo' @('test', '--workspace', '--offline', '--', '--nocapture') 'rust-tests.log'
    Invoke-Logged 'node' @('--test', 'tests/ui-utils.test.mjs') 'ui-utils-tests.log'
    Invoke-Logged 'node' @('--test', 'tests/dense-layout.test.mjs') 'dense-layout-tests.log'
    Invoke-Logged 'node' @('--test', 'tests/folder-projection.test.mjs') 'folder-projection-tests.log'
    Invoke-Logged 'npm.cmd' @('run', 'lint') 'lint.log'
    if ($Build) { Invoke-Logged 'npm.cmd' @('run', 'build') 'build.log' }
    Write-Output "Automated validation passed. Logs: $outputRoot. Interactive acceptance is separate."
} finally {
    Pop-Location
}
