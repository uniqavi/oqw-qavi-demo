# Prevent script from closing immediately on error
$ErrorActionPreference = "SilentlyContinue"

$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
} catch {
    Write-Host "Error starting server. The port $port might be in use or requires elevation."
    Read-Host "Press Enter to exit"
    Exit
}

Write-Host "=== Local Web Server for Operation Quiet Window ==="
Write-Host "Running at http://localhost:$port"
Write-Host "To stop the server, close this command prompt window."
Write-Host "==================================================="

# Open the default browser
Start-Process "http://localhost:$port/"

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/index.html" }

        # Resolve path to the dist directory in the same folder as this script
        $localPath = Join-Path $PSScriptRoot ("dist" + $path)

        if (Test-Path $localPath -PathType Leaf) {
            $response.StatusCode = 200
            
            # Content Type
            if ($path.EndsWith(".html")) { $response.ContentType = "text/html; charset=utf-8" }
            elseif ($path.EndsWith(".js")) { $response.ContentType = "application/javascript; charset=utf-8" }
            elseif ($path.EndsWith(".css")) { $response.ContentType = "text/css; charset=utf-8" }
            elseif ($path.EndsWith(".mp3")) { $response.ContentType = "audio/mpeg" }
            elseif ($path.EndsWith(".jpg") -or $path.EndsWith(".jpeg")) { $response.ContentType = "image/jpeg" }
            elseif ($path.EndsWith(".png")) { $response.ContentType = "image/png" }
            elseif ($path.EndsWith(".svg")) { $response.ContentType = "image/svg+xml" }
            else { $response.ContentType = "application/octet-stream" }

            # Read file in chunks to prevent memory overhead
            $fileStream = [System.IO.File]::OpenRead($localPath)
            $response.ContentLength64 = $fileStream.Length

            $buffer = New-Object Byte[] 65536
            while (($bytesRead = $fileStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $response.OutputStream.Write($buffer, 0, $bytesRead)
            }
            $fileStream.Close()
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.OutputStream.Close()
    } catch {
        # Catch and discard socket disconnects or cancellation errors
    }
}
