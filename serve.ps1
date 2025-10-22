# Simple PowerShell static file server for preview
param(
    [int]$Port = 5500,
    [string]$Root = (Get-Location).Path
)
Add-Type -AssemblyName System.Net
Add-Type -AssemblyName System.IO

$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
} catch {
    Write-Host "Failed to start listener on $prefix: $_" -ForegroundColor Red
    exit 1
}
Write-Host "Static server running at $prefix serving $Root" -ForegroundColor Green

function Get-ContentType($path) {
    switch ([System.IO.Path]::GetExtension($path).ToLower()) {
        ".html" { "text/html; charset=utf-8" }
        ".htm"  { "text/html; charset=utf-8" }
        ".js"   { "application/javascript; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".json" { "application/json; charset=utf-8" }
        ".png"  { "image/png" }
        ".jpg"  { "image/jpeg" }
        ".jpeg" { "image/jpeg" }
        ".gif"  { "image/gif" }
        ".webp" { "image/webp" }
        ".svg"  { "image/svg+xml" }
        ".mp4"  { "video/mp4" }
        ".wav"  { "audio/wav" }
        ".ogg"  { "audio/ogg" }
        default  { "application/octet-stream" }
    }
}

function Safe-Combine($root, $rel) {
    $clean = [System.Web.HttpUtility]::UrlDecode($rel)
    $clean = $clean -replace "^/", ""
    $clean = $clean -replace "\\", "/"
    # prevent path traversal
    if ($clean -match "\.\./" -or $clean -match "\.\.") { return $null }
    $full = Join-Path $root $clean
    return $full
}

while ($true) {
    try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        $rawPath = $req.Url.AbsolutePath
        if ([string]::IsNullOrEmpty($rawPath) -or $rawPath -eq "/") {
            $filePath = Join-Path $Root "index.html"
        } else {
            $filePath = Safe-Combine $Root $rawPath
            if (-not $filePath) {
                $res.StatusCode = 400
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("Bad Request")
                $res.OutputStream.Write($bytes,0,$bytes.Length)
                $res.Close()
                continue
            }
            if ([System.IO.Directory]::Exists($filePath)) {
                $filePath = Join-Path $filePath "index.html"
            }
        }
        if ([System.IO.File]::Exists($filePath)) {
            try {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $res.ContentType = Get-ContentType $filePath
                $res.StatusCode = 200
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes,0,$bytes.Length)
            } catch {
                $res.StatusCode = 500
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("Internal Server Error")
                $res.OutputStream.Write($bytes,0,$bytes.Length)
            }
        } else {
            $res.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
            $res.OutputStream.Write($bytes,0,$bytes.Length)
        }
        $res.Close()
    } catch {
        Start-Sleep -Milliseconds 10
    }
}