Add-Type -AssemblyName System.Drawing

function Build-Hero-Banner {
    param(
        [string]$inputPath,
        [string]$outputPath
    )

    Write-Host "Processing Hero Banner for $inputPath -> $outputPath"
    $srcBmp = [System.Drawing.Bitmap]::FromFile($inputPath)
    
    # Crop below the old burnt-in banner (old banner ends at ~36% from top)
    $cropTopPx = [int]($srcBmp.Height * 0.36)
    $srcWidth = $srcBmp.Width
    $srcHeight = $srcBmp.Height - $cropTopPx
    $size = 1024

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

    $srcRect = New-Object System.Drawing.Rectangle(0, $cropTopPx, $srcWidth, $srcHeight)
    $destRect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $g.DrawImage($srcBmp, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $bw = 760
    $bh = 135
    $bx = [int](($size - $bw) / 2)
    $by = 45
    $radius = 24

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($bx, $by, $radius, $radius, 180, 90)
    $path.AddArc($bx + $bw - $radius, $by, $radius, $radius, 270, 90)
    $path.AddArc($bx + $bw - $radius, $by + $bh - $radius, $radius, $radius, 0, 90)
    $path.AddArc($bx, $by + $bh - $radius, $radius, $radius, 90, 90)
    $path.CloseFigure()

    $shadowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $shadowPath.AddArc($bx + 4, $by + 6, $radius, $radius, 180, 90)
    $shadowPath.AddArc($bx + 4 + $bw - $radius, $by + 6, $radius, $radius, 270, 90)
    $shadowPath.AddArc($bx + 4 + $bw - $radius, $by + 6 + $bh - $radius, $radius, $radius, 0, 90)
    $shadowPath.AddArc($bx + 4, $by + 6 + $bh - $radius, $radius, $radius, 90, 90)
    $shadowPath.CloseFigure()

    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(140, 0, 0, 0))
    $g.FillPath($shadowBrush, $shadowPath)

    $rect = New-Object System.Drawing.RectangleF([float]$bx, [float]$by, [float]$bw, [float]$bh)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(242, 90, 20, 20),
        [System.Drawing.Color]::FromArgb(245, 50, 10, 10),
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $g.FillPath($bgBrush, $path)

    $goldPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 245, 167, 66), 3.5)
    $g.DrawPath($goldPen, $path)

    $innerPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $ibx = $bx + 4; $iby = $by + 4; $ibw = $bw - 8; $ibh = $bh - 8; $iradius = 18
    $innerPath.AddArc($ibx, $iby, $iradius, $iradius, 180, 90)
    $innerPath.AddArc($ibx + $ibw - $iradius, $iby, $iradius, $iradius, 270, 90)
    $innerPath.AddArc($ibx + $ibw - $iradius, $iby + $ibh - $iradius, $iradius, $iradius, 0, 90)
    $innerPath.AddArc($ibx, $iby + $ibh - $iradius, $iradius, $iradius, 90, 90)
    $innerPath.CloseFigure()
    
    $innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(140, 255, 230, 150), 1)
    $g.DrawPath($innerPen, $innerPath)

    # Logo Emblem
    $logoX = $bx + 30
    $logoY = $by + 20
    $logoPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 245, 167, 66), 3)
    
    $g.DrawArc($logoPen, $logoX, $logoY + 65, 60, 30, 200, 140)
    $g.DrawLine($logoPen, $logoX + 30, $logoY + 80, $logoX + 30, $logoY + 30)
    $g.DrawArc($logoPen, $logoX + 30, $logoY + 15, 30, 40, 270, 180)
    $g.DrawArc($logoPen, $logoX + 5, $logoY + 25, 35, 45, 90, 160)

    $textX = $bx + 110
    $textW = $bw - 135

    # Title: "पुण्यता - भारत का पुण्य साथी"
    $titleText = "$([char]0x092A)$([char]0x0941)$([char]0x0923)$([char]0x094D)$([char]0x092F)$([char]0x0924)$([char]0x093E) - $([char]0x092D)$([char]0x093E)$([char]0x0930)$([char]0x0924) $([char]0x0915)$([char]0x093E) $([char]0x092A)$([char]0x0941)$([char]0x0923)$([char]0x094D)$([char]0x092F) $([char]0x0938)$([char]0x093E)$([char]0x0925)$([char]0x0940)"
    
    # Subtitle: "तीर्थ गुरु पुष्करराज के पवित्र घाटों से" (Corrected Ghaton: 0x0918 + 0x093E + 0x091F + 0x094B + 0x0902)
    $subText   = "$([char]0x0924)$([char]0x0940)$([char]0x0930)$([char]0x094D)$([char]0x0925) $([char]0x0917)$([char]0x0941)$([char]0x0930)$([char]0x0941) $([char]0x092A)$([char]0x0941)$([char]0x0937)$([char]0x094D)$([char]0x0915)$([char]0x0930)$([char]0x0930)$([char]0x093E)$([char]0x091C) $([char]0x0915)$([char]0x0947) $([char]0x092A)$([char]0x0935)$([char]0x093F)$([char]0x0924)$([char]0x0930) $([char]0x0918)$([char]0x093E)$([char]0x091F)$([char]0x094B)$([char]0x0902) $([char]0x0938)$([char]0x0947)"

    $titleFont = New-Object System.Drawing.Font('Nirmala UI', 24, [System.Drawing.FontStyle]::Bold)
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 235, 170))

    $subFont = New-Object System.Drawing.Font('Nirmala UI', 15, [System.Drawing.FontStyle]::Bold)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 255, 255, 255))

    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Near
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    $titleRect = New-Object System.Drawing.RectangleF([float]$textX, [float]($by + 16), [float]$textW, [float]52)
    $g.DrawString($titleText, $titleFont, $titleBrush, $titleRect, $sf)

    $subRect = New-Object System.Drawing.RectangleF([float]$textX, [float]($by + 72), [float]$textW, [float]42)
    $g.DrawString($subText, $subFont, $subBrush, $subRect, $sf)

    $srcBmp.Dispose()
    $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $canvas.Dispose()
    $g.Dispose()
    Write-Host "Successfully generated updated banner image $outputPath"
}

Build-Hero-Banner -inputPath 'src/assets/hero/pushkar-ghats.jpg' -outputPath 'src/assets/hero/pushkar-ghats.jpg'
