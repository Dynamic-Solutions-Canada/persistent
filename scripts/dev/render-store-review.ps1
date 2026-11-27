<#
Render a contact sheet from the actual store PNGs without a browser or additional software.
-Locale picks the listing locale whose Play and Microsoft sets fill the top rows (default en-US;
review.png is the en-US sheet; -Locale de-DE writes render/review-de-DE.png, which is not committed). The hero row always shows
every locale.
#>
param([Parameter(Mandatory)][string]$AssetsRoot, [string]$Locale = 'en-US')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$manifest = Get-Content (Join-Path $AssetsRoot 'manifest.json') -Raw | ConvertFrom-Json
$listings = Get-Content (Join-Path $AssetsRoot 'microsoft/listings.json') -Raw -Encoding utf8 | ConvertFrom-Json
# The generated hero (D-123) is one image per listing locale; copyFrom locales reuse their target's.
$hero = @($manifest.microsoft | Where-Object { $_.PSObject.Properties['hero'] }) | Select-Object -First 1
$heroLocales = @($listings.locales.PSObject.Properties | Where-Object { -not $_.Value.PSObject.Properties['copyFrom'] } | ForEach-Object Name)
$height = if ($hero) { 1330 } else { 1060 }
$canvas = [Drawing.Bitmap]::new(2200,$height,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [Drawing.Graphics]::FromImage($canvas)
$heading = [Drawing.Font]::new('Segoe UI',28,[Drawing.FontStyle]::Bold)
$label = [Drawing.Font]::new('Segoe UI',16)
$ink = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#26384a'))

# Fit each real export inside its preview cell without changing its aspect ratio.
function Draw-ContainedPreview($Image, [int]$Left, [int]$Top, [int]$Width, [int]$Height) {
    $scale = [Math]::Min($Width / $Image.Width, $Height / $Image.Height)
    $scaledWidth = [int][Math]::Round($Image.Width * $scale)
    $scaledHeight = [int][Math]::Round($Image.Height * $scale)
    $x = $Left + [int](($Width - $scaledWidth) / 2)
    $graphics.DrawImage($Image,[Drawing.Rectangle]::new($x,$Top,$scaledWidth,$scaledHeight))
}
try {
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#eef0f2'))
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawString('Google Play: app screens, notifications, and alarms',$heading,$ink,30,18)
    # Keep the entire carousel visible when a refresh adds native screenshots.
    $playCellWidth = [int][Math]::Floor(2140 / $manifest.play.Count)
    $playPreviewWidth = $playCellWidth - 27
    for ($index=0; $index -lt $manifest.play.Count; $index++) {
        $shot = $manifest.play[$index]
        $image = [Drawing.Image]::FromFile((Join-Path $AssetsRoot ([string]$shot.file).Replace('{locale}',$Locale)))
        try { Draw-ContainedPreview $image (30+$index*$playCellWidth) 78 $playPreviewWidth 587 }
        finally { $image.Dispose() }
        $name = [IO.Path]::GetFileNameWithoutExtension($shot.file).Substring(3).Replace('-light','').Replace('-dark','').Replace('-',' ')
        $graphics.DrawString($name,$label,$ink,(30+$index*$playCellWidth),674)
    }
    $graphics.DrawString('Microsoft Store: generated hero, then the actual Windows tray flyout',$heading,$ink,30,724)
    # As for Play, keep the whole listing in one row however many screenshots it has.
    $microsoftCellWidth = [int][Math]::Floor(2140 / $manifest.microsoft.Count)
    for ($index=0; $index -lt $manifest.microsoft.Count; $index++) {
        $shot = $manifest.microsoft[$index]
        $file = ([string]$shot.file).Replace('{locale}',$Locale)
        $image = [Drawing.Image]::FromFile((Join-Path (Join-Path $AssetsRoot 'microsoft') $file))
        try { Draw-ContainedPreview $image (30+$index*$microsoftCellWidth) 785 ($microsoftCellWidth-22) 260 }
        finally { $image.Dispose() }
    }
    if ($hero) {
        $graphics.DrawString('Microsoft Store: the hero in every listing locale',$heading,$ink,30,1040)
        $heroCellWidth = [int][Math]::Floor(2140 / $heroLocales.Count)
        for ($index=0; $index -lt $heroLocales.Count; $index++) {
            $locale = $heroLocales[$index]
            $file = ([string]$hero.file).Replace('{locale}',$locale)
            $image = [Drawing.Image]::FromFile((Join-Path (Join-Path $AssetsRoot 'microsoft') $file))
            try { Draw-ContainedPreview $image (30+$index*$heroCellWidth) 1100 ($heroCellWidth-22) 180 }
            finally { $image.Dispose() }
            # Label each hero just below it, at its contained 16:9 height.
            $graphics.DrawString($locale,$label,$ink,(30+$index*$heroCellWidth),(1108+[int](($heroCellWidth-22)*9/16)))
        }
    }
    # Other locales' sheets are working previews, kept out of the repository in render/.
    $output = if ($Locale -eq 'en-US') { Join-Path $AssetsRoot 'review.png' } else { Join-Path $AssetsRoot "render/review-$Locale.png" }
    $canvas.Save($output,[Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Saved review preview: $output"
} finally {
    $ink.Dispose(); $label.Dispose(); $heading.Dispose(); $graphics.Dispose(); $canvas.Dispose()
}
