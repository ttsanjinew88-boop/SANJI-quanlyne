# build.ps1 — gop cac manh trong src/ thanh dashboard_v2.html (mot file, khong doi runtime).
# Thao tac tren CHUOI THO (.Replace), khong dung AppendLine/Environment.NewLine,
# nen giu nguyen CRLF va khong phu thuoc he dieu hanh (chay giong nhau tren Windows lan Linux CI).
# Moi include la mot dong marker rieng trong src/dashboard_v2.src.html; file .js/.css KHONG co
# newline dau/cuoi thua -> ghep lai byte-identical. Phep thu vang: build xong git diff phai RONG.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$enc  = [System.Text.UTF8Encoding]::new($false)   # UTF-8 khong BOM

$includes = @(
  @('/*#include styles.css*/',  'styles.css'),
  @('//#include js/core.js',        'js/core.js'),
  @('//#include js/auth.js',        'js/auth.js'),
  @('//#include js/admin.js',       'js/admin.js'),
  @('//#include js/data-boot.js',   'js/data-boot.js'),
  @('//#include js/upload.js',      'js/upload.js'),
  @('//#include js/nav-donrut.js',  'js/nav-donrut.js'),
  @('//#include js/render.js',      'js/render.js'),
  @('//#include js/shift-rank.js',  'js/shift-rank.js'),
  @('//#include js/bc.js',          'js/bc.js')
)

$tpl = [IO.File]::ReadAllText((Join-Path $root 'src/dashboard_v2.src.html'), $enc)
foreach ($inc in $includes) {
  $content = [IO.File]::ReadAllText((Join-Path $root ('src/' + $inc[1])), $enc)
  $tpl = $tpl.Replace($inc[0], $content)
}
[IO.File]::WriteAllText((Join-Path $root 'dashboard_v2.html'), $tpl, $enc)
Write-Host "Built dashboard_v2.html ($($tpl.Length) chars)"
