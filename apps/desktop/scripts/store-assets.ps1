# Store-Kacheln aus dem vorhandenen Markenasset; läuft auf dem Windows-Runner.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$desktop = Split-Path $PSScriptRoot -Parent
$assetDir = Join-Path $desktop 'build/appx'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
$source = [System.Drawing.Image]::FromFile((Join-Path $desktop 'build/icon.png'))
try {
  foreach ($asset in @(
    @{ Name = 'StoreLogo.png'; Width = 50; Height = 50 },
    @{ Name = 'Square44x44Logo.png'; Width = 44; Height = 44 },
    @{ Name = 'Square150x150Logo.png'; Width = 150; Height = 150 },
    @{ Name = 'Wide310x150Logo.png'; Width = 310; Height = 150 }
  )) {
    $bitmap = [System.Drawing.Bitmap]::new($asset.Width, $asset.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $size = [Math]::Min($asset.Width, $asset.Height)
      $graphics.DrawImage($source, [int](($asset.Width - $size) / 2), [int](($asset.Height - $size) / 2), $size, $size)
      $bitmap.Save((Join-Path $assetDir $asset.Name), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally {
  $source.Dispose()
}
