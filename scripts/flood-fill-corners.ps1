Add-Type -AssemblyName System.Drawing
$inPath = $args[0]
$outPath = $args[1]
$threshold = 245

$loaded = [System.Drawing.Bitmap]::FromFile($inPath)
$w = $loaded.Width
$h = $loaded.Height
$bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $c = $loaded.GetPixel($x, $y)
    $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $c.R, $c.G, $c.B))
  }
}
$loaded.Dispose()

function Test-Bg([System.Drawing.Color]$c) {
  return ($c.A -gt 0 -and $c.R -ge $threshold -and $c.G -ge $threshold -and $c.B -ge $threshold)
}

$visited = New-Object 'bool[,]' $w, $h
$queue = New-Object System.Collections.Generic.Queue[object]
$starts = @(
  (New-Object int[] 2),
  (New-Object int[] 2),
  (New-Object int[] 2),
  (New-Object int[] 2)
)
$starts[0][0] = 0; $starts[0][1] = 0
$starts[1][0] = $w - 1; $starts[1][1] = 0
$starts[2][0] = 0; $starts[2][1] = $h - 1
$starts[3][0] = $w - 1; $starts[3][1] = $h - 1

foreach ($s in $starts) {
  $sx = $s[0]; $sy = $s[1]
  if (-not (Test-Bg ($bmp.GetPixel($sx, $sy)))) { continue }
  if ($visited[$sx, $sy]) { continue }
  $visited[$sx, $sy] = $true
  $queue.Enqueue($s)
}

while ($queue.Count -gt 0) {
  $p = $queue.Dequeue()
  $x = $p[0]; $y = $p[1]
  $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  foreach ($dx in @(-1, 0, 1)) {
    foreach ($dy in @(-1, 0, 1)) {
      if ([Math]::Abs($dx) + [Math]::Abs($dy) -ne 1) { continue }
      $nx = $x + $dx; $ny = $y + $dy
      if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $w -or $ny -ge $h) { continue }
      if ($visited[$nx, $ny]) { continue }
      if (-not (Test-Bg ($bmp.GetPixel($nx, $ny)))) { continue }
      $visited[$nx, $ny] = $true
      $n = New-Object int[] 2
      $n[0] = $nx; $n[1] = $ny
      $queue.Enqueue($n)
    }
  }
}

$tmp = Join-Path $env:TEMP ("amd-flood-" + [guid]::NewGuid().ToString() + ".png")
$bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Copy-Item -Force $tmp $outPath
Remove-Item -Force $tmp
Write-Host "Flood-fill complete -> $outPath"