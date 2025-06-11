# Master Config API テスト
$url = "http://localhost:5173/api/master-config"
$headers = @{
    "Content-Type" = "application/json"
    "Origin" = "http://localhost:5174"
}
$body = @{
    "action" = "getConfig"
} | ConvertTo-Json

Write-Host "=== Master Config API テスト ==="
Write-Host "URL: $url"
Write-Host "リクエスト送信中..."

try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173/api/master-config" -Method POST -Headers $headers -Body $body -UseBasicParsing
    Write-Host "ステータス: $($response.StatusCode)"
    Write-Host "レスポンス:"
    Write-Host $response.Content
} catch {
    Write-Host "エラー: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        Write-Host "HTTPステータス: $($_.Exception.Response.StatusCode)"
    }
}