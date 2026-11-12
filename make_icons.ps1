Add-Type -AssemblyName System.Drawing

function New-Icon {
  param([int]$Size, [string]$Path, [double]$ContentScale = 1.0, [bool]$Round = $true)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  # Fond
  $bg = [System.Drawing.ColorTranslator]::FromHtml('#0b0e13')
  $g.Clear($bg)

  # Carte arrondie
  $card = [System.Drawing.ColorTranslator]::FromHtml('#141a23')
  $line = [System.Drawing.ColorTranslator]::FromHtml('#2a3546')
  $inset = [int]($Size * 0.045)
  $rect = New-Object System.Drawing.Rectangle($inset, $inset, ($Size - 2 * $inset), ($Size - 2 * $inset))

  if ($Round) {
    $r = [int]($Size * 0.22)
    $pathGeo = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $pathGeo.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $pathGeo.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $pathGeo.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $pathGeo.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $pathGeo.CloseFigure()
    $brush = New-Object System.Drawing.SolidBrush($card)
    $pen = New-Object System.Drawing.Pen($line, [Math]::Max(1, $Size * 0.012))
    $g.FillPath($brush, $pathGeo)
    $g.DrawPath($pen, $pathGeo)
  } else {
    $brush = New-Object System.Drawing.SolidBrush($card)
    $g.FillRectangle($brush, $rect)
  }

  # Trois mots
  $words = @(
    @{ T = 'der'; C = '#5b8def' },
    @{ T = 'die'; C = '#ef5f86' },
    @{ T = 'das'; C = '#2fbf8f' }
  )

  $family = 'Segoe UI'
  if (-not ([System.Drawing.FontFamily]::Families | Where-Object { $_.Name -eq $family })) { $family = 'Arial' }

  $fontSize = [float]($Size * 0.215 * $ContentScale)
  $font = New-Object System.Drawing.Font($family, $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel))
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

  $lineH = [double]($Size * 0.245 * $ContentScale)
  $centerY = [double]($Size / 2)
  $startY = $centerY - $lineH

  for ($i = 0; $i -lt 3; $i++) {
    $color = [System.Drawing.ColorTranslator]::FromHtml($words[$i].C)
    $b = New-Object System.Drawing.SolidBrush($color)
    $y = $startY + $i * $lineH
    $box = New-Object System.Drawing.RectangleF(0, ([float]$y), ([float]$Size), ([float]$lineH))
    $g.DrawString($words[$i].T, $font, $b, $box, $fmt)
    $b.Dispose()
  }

  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "OK $Path"
}

$dir = Join-Path $PSScriptRoot 'icons'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

New-Icon -Size 512 -Path (Join-Path $dir 'icon-512.png') -ContentScale 1.0
New-Icon -Size 192 -Path (Join-Path $dir 'icon-192.png') -ContentScale 1.0
New-Icon -Size 180 -Path (Join-Path $dir 'apple-touch-icon.png') -ContentScale 1.0 -Round $false
New-Icon -Size 512 -Path (Join-Path $dir 'icon-maskable-512.png') -ContentScale 0.68 -Round $false
