$root = Split-Path $PSScriptRoot -Parent
$l = New-Object Net.HttpListener
$l.Prefixes.Add('http://localhost:8788/')
$l.Start()
Write-Host "Serving $root at http://localhost:8788/"
while ($l.IsListening) {
  $c = $l.GetContext()
  $p = [Uri]::UnescapeDataString($c.Request.Url.LocalPath.TrimStart('/'))
  if ($p -eq '') { $p = 'dashboard_v2.html' }
  $f = Join-Path $root $p
  if ((Test-Path $f -PathType Leaf) -and $f.StartsWith($root)) {
    $b = [IO.File]::ReadAllBytes($f)
    if ($f -match '\.html$') { $c.Response.ContentType = 'text/html; charset=utf-8' }
    $c.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $c.Response.StatusCode = 404 }
  $c.Response.Close()
}
