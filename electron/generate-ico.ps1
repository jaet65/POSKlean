Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\build\icon.png"
$icoPath = Join-Path $PSScriptRoot "..\build\icon.ico"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source icon not found: $srcPath"
    exit 1
}

$srcBmp = [System.Drawing.Bitmap]::FromFile($srcPath)
$sizes = @(256, 128, 64, 48, 32, 16)
$pngStreams = @()

foreach ($sz in $sizes) {
    $resized = New-Object System.Drawing.Bitmap($sz, $sz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($resized)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($srcBmp, 0, 0, $sz, $sz)
    $g.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $resized.Dispose()
    $pngStreams += $ms
}
$srcBmp.Dispose()

$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR header (6 bytes)
$bw.Write([uint16]0)          # Reserved: 0
$bw.Write([uint16]1)          # Type: 1 (icon)
$bw.Write([uint16]$sizes.Count) # Count of images

$offset = 6 + (16 * $sizes.Count)

for ($i = 0; $i -lt $sizes.Count; $i++) {
    $sz = $sizes[$i]
    $dataLen = $pngStreams[$i].Length
    $wByte = if ($sz -eq 256) { [byte]0 } else { [byte]$sz }
    $hByte = if ($sz -eq 256) { [byte]0 } else { [byte]$sz }
    
    $bw.Write($wByte)
    $bw.Write($hByte)
    $bw.Write([byte]0)          # Color count
    $bw.Write([byte]0)          # Reserved
    $bw.Write([uint16]1)        # Color planes
    $bw.Write([uint16]32)       # Bits per pixel
    $bw.Write([uint32]$dataLen) # Bytes in resource
    $bw.Write([uint32]$offset)  # Image offset
    
    $offset += $dataLen
}

for ($i = 0; $i -lt $sizes.Count; $i++) {
    $bytes = $pngStreams[$i].ToArray()
    $bw.Write($bytes)
    $pngStreams[$i].Dispose()
}

$bw.Close()
$fs.Close()
Write-Host "Generated $icoPath successfully."
