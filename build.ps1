# build.ps1 — gop cac manh trong src/ thanh dashboard_v2.html (mot file, khong doi runtime).
# Thao tac tren CHUOI THO (.Replace), khong dung AppendLine/Environment.NewLine,
# nen giu nguyen CRLF va khong phu thuoc he dieu hanh (chay giong nhau tren Windows lan Linux CI).
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$enc  = [System.Text.UTF8Encoding]::new($false)   # UTF-8 khong BOM
function Inc([string]$rel){ [IO.File]::ReadAllText((Join-Path $root ("src/" + $rel)), $enc) }

$tpl = [IO.File]::ReadAllText((Join-Path $root 'src/dashboard_v2.src.html'), $enc)
$tpl = $tpl.Replace('/*#include styles.css*/', (Inc 'styles.css'))
$tpl = $tpl.Replace('//#include js/bc.js',     (Inc 'js/bc.js'))
[IO.File]::WriteAllText((Join-Path $root 'dashboard_v2.html'), $tpl, $enc)
Write-Host "Built dashboard_v2.html ($($tpl.Length) chars)"
