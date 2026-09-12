Add-Type -AssemblyName System.Drawing

function New-IconoMemento {
    param([int]$Size, [bool]$Maskable, [string]$OutPath)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $color1 = [System.Drawing.Color]::FromArgb(110, 193, 255)
    $color2 = [System.Drawing.Color]::FromArgb(31, 127, 232)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $color1, $color2, 90)

    if ($Maskable) {
        # Fondo completo (el panel de la máscara lo recorta después)
        $g.FillRectangle($brush, $rect)
    } else {
        # Botón redondeado con margen para íconos regulares
        $margin = [int]($Size * 0.08)
        $inner = New-Object System.Drawing.RectangleF($margin, $margin, ($Size - 2 * $margin), ($Size - 2 * $margin))
        $radius = ($Size * 0.22)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $d = $radius * 2
        $path.AddArc($inner.X, $inner.Y, $d, $d, 180, 90)
        $path.AddArc($inner.Right - $d, $inner.Y, $d, $d, 270, 90)
        $path.AddArc($inner.Right - $d, $inner.Bottom - $d, $d, $d, 0, 90)
        $path.AddArc($inner.X, $inner.Bottom - $d, $d, $d, 90, 90)
        $path.CloseFigure()
        $g.FillPath($brush, $path)
        # sombra suave interior
        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(40, 255, 255, 255), ($Size * 0.015))
        $g.DrawPath($pen, $path)
        $pen.Dispose()
        $path.Dispose()
    }

    # Letra "M" blanca centrada
    $fontSize = [float]($Size * ([Math]::Max(0.52, 0.5)))  # base
    if ($Maskable) { $fontSize = $Size * 0.42 }  # más chica para zona segura
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)

    # Sombra sutil de la letra
    $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(60, 0, 0, 0))
    $rShadow = New-Object System.Drawing.RectangleF(($Size * 0.02), ($Size * 0.03), $Size, $Size)
    $g.DrawString("M", $font, $shadowBrush, $rShadow, $sf)

    $r = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $g.DrawString("M", $font, $white, $r, $sf)

    # Marca de verificación (accento) en la parte inferior derecha de la "M"
    $checkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $pen2 = New-Object System.Drawing.Pen($checkBrush, ($Size * 0.07))
    $pen2.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen2.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $xo = $Size * 0.58
    $yo = $Size * 0.60
    $g.DrawLine($pen2, ($xo - $Size * 0.14), ($yo + $Size * 0.10), ($xo - $Size * 0.04), ($yo + $Size * 0.22))
    $g.DrawLine($pen2, ($xo - $Size * 0.04), ($yo + $Size * 0.22), ($xo + $Size * 0.16), ($yo - $Size * 0.08))

    $pen2.Dispose()
    $checkBrush.Dispose()
    $shadowBrush.Dispose()
    $white.Dispose()
    $font.Dispose()
    $sf.Dispose()
    $brush.Dispose()
    $g.Dispose()

    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

New-IconoMemento -Size 192  -Maskable $false -OutPath (Join-Path $PSScriptRoot "icon-192.png")
New-IconoMemento -Size 512  -Maskable $false -OutPath (Join-Path $PSScriptRoot "icon-512.png")
New-IconoMemento -Size 512  -Maskable $true  -OutPath (Join-Path $PSScriptRoot "icon-maskable-512.png")
Write-Output "Iconos generados en $PSScriptRoot"