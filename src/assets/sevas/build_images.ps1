Add-Type -AssemblyName System.Drawing

function New-SevaBadge {
    param(
        [string]$inputPath,
        [string]$outputPath,
        [string]$titleText,
        [string]$subtitleText,
        [double]$cropTopPercent = 0.0
    )

    Write-Host "Processing $inputPath -> $outputPath"
    $srcBmp = [System.Drawing.Bitmap]::FromFile($inputPath)
    
    $cropTopPx = [int]($srcBmp.Height * $cropTopPercent)
    $srcWidth = $srcBmp.Width
    $srcHeight = $srcBmp.Height - $cropTopPx

    $size = [Math]::Max($srcWidth, $srcHeight)
    if ($size -lt 1024) { $size = 1024 }

    $canvas = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $scale = [Math]::Max($size / $srcWidth, $size / $srcHeight)
    $w = [int]($srcWidth * $scale)
    $h = [int]($srcHeight * $scale)
    $x = [int](($size - $w) / 2)
    $y = [int](($size - $h) / 2)

    $srcRect = New-Object System.Drawing.Rectangle($0, $cropTopPx, $srcWidth, $srcHeight)
    $destRect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $g.DrawImage($srcBmp, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $bw = [int]($size * 0.70)
    $bh = [int]($size * 0.125)
    $bx = [int](($size - $bw) / 2)
    $by = [int]($size * 0.05)

    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(120, 0, 0, 0))
    $g.FillRectangle($shadowBrush, $bx + 4, $by + 4, $bw, $bh)

    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 130, 32, 20))
    $g.FillRectangle($bgBrush, $bx, $by, $bw, $bh)

    $goldPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 225, 160, 50), [int]($size * 0.0035))
    $g.DrawRectangle($goldPen, $bx, $by, $bw, $bh)
    
    $innerGoldPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 255, 215, 120), 1)
    $g.DrawRectangle($innerGoldPen, $bx + 3, $by + 3, $bw - 6, $bh - 6)

    $fontSizeTitle = [int]($size * 0.028)
    $titleFont = New-Object System.Drawing.Font('Nirmala UI', $fontSizeTitle, [System.Drawing.FontStyle]::Bold)
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 235, 170))

    $fontSizeSub = [int]($size * 0.016)
    $subFont = New-Object System.Drawing.Font('Nirmala UI', $fontSizeSub, [System.Drawing.FontStyle]::Bold)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 255, 255, 255))

    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    $titleRect = New-Object System.Drawing.RectangleF([float]$bx, [float]($by + ($bh * 0.10)), [float]$bw, [float]($bh * 0.45))
    $g.DrawString($titleText, $titleFont, $titleBrush, $titleRect, $sf)

    $subRect = New-Object System.Drawing.RectangleF([float]$bx, [float]($by + ($bh * 0.52)), [float]$bw, [float]($bh * 0.38))
    $g.DrawString($subtitleText, $subFont, $subBrush, $subRect, $sf)

    $srcBmp.Dispose()
    $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
    $g.Dispose()
}

$titleSadhu    = "$([char]0x0938)$([char]0x093E)$([char]0x0927)$([char]0x0941) $([char]0x0938)$([char]0x0902)$([char]0x0924)$([char]0x094B)$([char]0x0902) $([char]0x0915)$([char]0x094B) $([char]0x092D)$([char]0x094B)$([char]0x091C)$([char]0x0928)"
$titleGau      = "$([char]0x0928)$([char]0x093F)$([char]0x0930)$([char]0x0902)$([char]0x0924)$([char]0x0930) $([char]0x0917)$([char]0x094C) $([char]0x0938)$([char]0x0947)$([char]0x0935)$([char]0x093E)"
$titleDeepdaan = "$([char]0x0938)$([char]0x0930)$([char]0x094B)$([char]0x0935)$([char]0x0930) $([char]0x0926)$([char]0x0940)$([char]0x092A)$([char]0x0926)$([char]0x093E)$([char]0x0928)"
$subtitle      = "$([char]0x0906)$([char]0x092A)$([char]0x0915)$([char]0x0947) $([char]0x092A)$([char]0x0930)$([char]0x093F)$([char]0x0935)$([char]0x093E)$([char]0x0930) $([char]0x0915)$([char]0x0947) $([char]0x0932)$([char]0x093F)$([char]0x090F) $([char]0x0938)$([char]0x0940)$([char]0x0927)$([char]0x093E) $([char]0x092A)$([char]0x0941)$([char]0x0923)$([char]0x094D)$([char]0x092F) $([char]0x092A)$([char]0x094D)$([char]0x0930)$([char]0x0935)$([char]0x093E)$([char]0x0939)"

New-SevaBadge -inputPath 'src/assets/plans/varsh_2.png' -outputPath 'src/assets/sevas/sadhu_bhojan.png' -titleText $titleSadhu -subtitleText $subtitle
New-SevaBadge -inputPath 'src/assets/plans/grah_3.png' -outputPath 'src/assets/sevas/gau_seva.png' -titleText $titleGau -subtitleText $subtitle
New-SevaBadge -inputPath 'src/assets/pushkar-ghat.jpg' -outputPath 'src/assets/sevas/sarovar_deepdaan.png' -titleText $titleDeepdaan -subtitleText $subtitle -cropTopPercent 0.22

# Update hero diya-aarti.jpg to use the photorealistic floating diyas of Pushkar ghat
Copy-Item -Force 'src/assets/sevas/sarovar_deepdaan.png' 'src/assets/hero/diya-aarti.jpg'
