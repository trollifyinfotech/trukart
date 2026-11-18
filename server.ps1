# Tiny static web server using only what ships with Windows (no install). Used by START_WEBSITE.bat when Python is missing.
param([int]$Port = 8090)
$root = (Split-Path -Parent $MyInvocation.MyCommand.Path)
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.webp'='image/webp'; '.ico'='image/x-icon'; '.json'='application/json'; '.txt'='text/plain; charset=utf-8'; '.sql'='text/plain; charset=utf-8'; '.webmanifest'='application/manifest+json'; '.woff2'='font/woff2' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Host "Could not start the server on port ${Port}: $($_.Exception.Message)"; Write-Host "Another program may be using this port. Close it, or edit PORT in START_WEBSITE.bat."; exit 1 }
Write-Host "Website running at http://localhost:$Port/  (close this window to stop)"
Start-Process "http://localhost:$Port/index.html"
while ($listener.IsListening) {
  $ctx = $listener.GetContext(); $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/')); if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { $res.StatusCode = 404; $bytes = [Text.Encoding]::UTF8.GetBytes('Not found') }
    else { $ext = [IO.Path]::GetExtension($path).ToLower(); if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }; $bytes = [IO.File]::ReadAllBytes($path) }
    $res.Headers.Add('X-Content-Type-Options','nosniff'); if ($rel -match '\.(html|js|css|json)$' -or $rel -eq 'index.html') { $res.Headers.Add('Cache-Control','no-cache') }; if ($rel -match 'sw\.js$') { $res.Headers.Add('Service-Worker-Allowed','/') }; $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch { } finally { try { $res.OutputStream.Close() } catch { } }
}
