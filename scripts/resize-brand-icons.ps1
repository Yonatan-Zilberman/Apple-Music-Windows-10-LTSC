Add-Type -AssemblyName System.Drawing
$srcPath = $args[0]
$assets = $args[1]
$tmp = Join-Path $env:TEMP "amd-icons"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

function New-ClearBitmap([int]$size) {
  $fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  $bmp = New-Object System.Drawing.Bitmap $size, $size, $fmt
  for ($y = 0; $y -lt $size; $y++) {
    for ($x = 0; $x -lt $size; $x++) {
      $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
    }
  }
  return $bmp
}

function Resize-Png($src, [int]$size, $outPath) {
  $bmp = New-ClearBitmap $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  if (Test-Path $outPath) { Remove-Item -Force $outPath }
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

Resize-Png $src 512 (Join-Path $assets "icon.png")
foreach ($s in @(16,24,32,48,64,128,256)) {
  Resize-Png $src $s (Join-Path $tmp ("icon-" + $s + ".png"))
}
$src.Dispose()
Write-Host "Resized OK"