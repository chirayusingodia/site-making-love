param(
    [string]$inputPath = 'src/assets/plans/punyata_hero.png',
    [string]$outputPath = 'src/assets/hero/pushkar-ghats.jpg'
)

Add-Type -AssemblyName System.Drawing

Write-Host "Generating Fresh Pushkar Hero from $inputPath -> $outputPath"
$srcBmp = [System.Drawing.Bitmap]::FromFile($inputPath)
$size = 1024

$canvas = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Draw the source image covering full canvas
$scale = [Math]::Max($size / $srcBmp.Width, $size / $srcBmp.Height)
$w = [int]($srcBmp.Width * $scale)
$h = [int]($srcBmp.Height * $scale)
$x = [int](($size - $w) / 2)
$y = [int](($size - $h) / 2)
$g.DrawImage($srcBmp, $x, $y, $w, $h)

# Draw a clean solid dark maroon header bar over top 220px to completely cover old text
$topBarRect = New-Object System.Drawing.RectangleF(0, 0, $size, 225)
$topBarBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $topBarRect,
    [System.Drawing.Color]::FromArgb(255, 120, 28, 20),
    [System.Drawing.Color]::FromArgb(255, 90, 18, 12),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
)
$g.FillRectangle($topBarBrush, $topBarRect)

# Gold Divider Line at bottom of header bar
$goldDivPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 245, 167, 66), 4)
$g.DrawLine($goldDivPen, 0, 225, $size, 225)

$goldInnerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 255, 220, 140), 1)
$g.DrawLine($goldInnerPen, 0, 221, $size, 221)

# Centered Text Column (No logo emblem)
$textX = 0
$textW = $size

# Title: "पुण्यता - भारत का पुण्य बैंक"
$titleText = "$([char]0x092A)$([char]0x0941)$([char]0x0923)$([char]0x094D)$([char]0x092F)$([char]0x0924)$([char]0x093E) - $([char]0x092D)$([char]0x093E)$([char]0x0930)$([char]0x0924) $([char]0x0915)$([char]0x093E) $([char]0x092A)$([char]0x0941)$([char]0x0923)$([char]0x094D)$([char]0x092F) $([char]0x092C)$([char]0x0948)$([char]0x0902)$([char]0x0915)"

# Subtitle: "तीर्थ गुरु पुष्करराज के पवित्र घाटों से"
$subText   = "$([char]0x0924)$([char]0x0940)$([char]0x0930)$([char]0x094D)$([char]0x0925) $([char]0x0917)$([char]0x0941)$([char]0x0930)$([char]0x0941) $([char]0x092A)$([char]0x0941)$([char]0x0937)$([char]0x094D)$([char]0x0915)$([char]0x0930)$([char]0x0930)$([char]0x093E)$([char]0x091C) $([char]0x0915)$([char]0x0947) $([char]0x092A)$([char]0x0935)$([char]0x093F)$([char]0x0924)$([char]0x0930) $([char]0x0918)$([char]0x093E)$([char]0x091F)$([char]0x094B)$([char]0x0902) $([char]0x0938)$([char]0x0947)"

$titleFont = New-Object System.Drawing.Font('Nirmala UI', 38, [System.Drawing.FontStyle]::Bold)
$titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 235, 160))

$subFont = New-Object System.Drawing.Font('Nirmala UI', 23, [System.Drawing.FontStyle]::Bold)
$subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 255, 255, 255))

$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

$titleRect = New-Object System.Drawing.RectangleF([float]$textX, [float]25, [float]$textW, [float]95)
$g.DrawString($titleText, $titleFont, $titleBrush, $titleRect, $sf)

$subRect = New-Object System.Drawing.RectangleF([float]$textX, [float]125, [float]$textW, [float]70)
$g.DrawString($subText, $subFont, $subBrush, $subRect, $sf)

$srcBmp.Dispose()
$canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$canvas.Dispose()
$g.Dispose()
Write-Host "Successfully built fresh Pushkar hero image without logo -> $outputPath"
