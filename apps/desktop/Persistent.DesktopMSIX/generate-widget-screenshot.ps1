# Renders the Windows widget picker preview, Images\WidgetScreenshot.png, which
# the manifest's widget definition names. It is a picture of the Upcoming card,
# not an icon, so devkit does not make it; it runs as the build's prepare step
# and its output is gitignored.
#
# The app icon on the card is the committed Resources\Persistent.png, which
# `npm run icons` writes from assets/brand/icon.svg with every other app icon.
#
# ASCII ONLY. Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI, so a UTF-8
# dash or curly quote inside a string breaks parsing in ways that are hard to see.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root      = Split-Path -Parent $PSScriptRoot
$imagesDir = Join-Path $PSScriptRoot 'Images'
$iconPath  = Join-Path $root 'Persistent.Desktop\Resources\Persistent.png'

if (-not (Test-Path $iconPath)) {
    throw "Resources\Persistent.png is missing. Run npm run icons from the repository root."
}
New-Item -ItemType Directory -Force -Path $imagesDir | Out-Null

# Palette, matching the icon tile.
$bg = [System.Drawing.Color]::FromArgb(255, 11, 15, 25)    # #0b0f19

function Save-WidgetScreenshot($source, [string]$path) {
    $bmp = New-Object System.Drawing.Bitmap(600, 400)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::FromArgb(255, 32, 36, 48))

    # A real preview of the Upcoming card, not a stretched app icon. This is what
    # the Windows widget picker shows before the user pins it.
    $g.DrawImage($source, 32, 26, 52, 52)
    $headingFont = [System.Drawing.Font]::new('Segoe UI', 22, [System.Drawing.FontStyle]::Bold)
    $bodyFont = [System.Drawing.Font]::new('Segoe UI', 14, [System.Drawing.FontStyle]::Regular)
    $rowFont = [System.Drawing.Font]::new('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
    $buttonFont = [System.Drawing.Font]::new('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
    $whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $mutedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 205, 210, 224))
    $widgetAccent = [System.Drawing.Color]::FromArgb(255, 18, 184, 134)
    $accentBrush = [System.Drawing.SolidBrush]::new($widgetAccent)
    $darkBrush = [System.Drawing.SolidBrush]::new($bg)

    $g.DrawString('Upcoming', $headingFont, $whiteBrush, 104, 28)
    $g.DrawString('Everything coming up, soonest first.', $bodyFont, $mutedBrush, 32, 88)

    $timeFormat = [System.Drawing.StringFormat]::new()
    $timeFormat.Alignment = [System.Drawing.StringAlignment]::Far

    $g.DrawLine([System.Drawing.Pens]::DimGray, 32, 132, 568, 132)
    $g.DrawString('Morning medication', $rowFont, $whiteBrush, 32, 145)
    $g.DrawString('Today, 9:00 a.m.', $bodyFont, $accentBrush, [System.Drawing.RectangleF]::new(300, 146, 268, 28), $timeFormat)

    $g.DrawLine([System.Drawing.Pens]::DimGray, 32, 178, 568, 178)
    $g.DrawString('Pick up groceries', $rowFont, $whiteBrush, 32, 191)
    $g.DrawString('Today, 5:30 p.m.', $bodyFont, $accentBrush, [System.Drawing.RectangleF]::new(300, 192, 268, 28), $timeFormat)

    $g.DrawLine([System.Drawing.Pens]::DimGray, 32, 224, 568, 224)
    $g.DrawString('Transfer rent', $rowFont, $whiteBrush, 32, 237)
    $g.DrawString('Tomorrow, 5:00 p.m.', $bodyFont, $accentBrush, [System.Drawing.RectangleF]::new(300, 238, 268, 28), $timeFormat)

    $g.DrawLine([System.Drawing.Pens]::DimGray, 32, 270, 568, 270)
    $g.DrawString('Garbage + recycling', $rowFont, $whiteBrush, 32, 283)
    $g.DrawString('Sep 17, 8:00 a.m.', $bodyFont, $accentBrush, [System.Drawing.RectangleF]::new(300, 284, 268, 28), $timeFormat)

    $button = [System.Drawing.RectangleF]::new(386, 336, 182, 40)
    $g.FillRectangle($accentBrush, $button)
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString('Open upcoming', $buttonFont, $darkBrush, $button, $format)

    $format.Dispose()
    $timeFormat.Dispose()
    $headingFont.Dispose()
    $bodyFont.Dispose()
    $rowFont.Dispose()
    $buttonFont.Dispose()
    $whiteBrush.Dispose()
    $mutedBrush.Dispose()
    $accentBrush.Dispose()
    $darkBrush.Dispose()
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$icon = [System.Drawing.Image]::FromFile($iconPath)
try {
    Save-WidgetScreenshot $icon (Join-Path $imagesDir 'WidgetScreenshot.png')
}
finally {
    $icon.Dispose()
}
Write-Host "  Images\WidgetScreenshot.png"
