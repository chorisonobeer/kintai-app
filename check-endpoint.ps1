# エンドポイントの基本確認スクリプト
$apiUrl = "https://script.google.com/macros/s/AKfycbzVbNy4uQsgxytwj36IgFZRvtyH5LXjieFYkyip6xI/dev"

Write-Host "Testing endpoint: $apiUrl" -ForegroundColor Cyan
Write-Host ""

try {
    # 基本的なGETリクエスト
    Write-Host "[Test 1] Basic GET request" -ForegroundColor Yellow
    $response = Invoke-WebRequest -Uri $apiUrl -Method GET -ErrorAction Stop
    
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Content Length: $($response.Content.Length)" -ForegroundColor Green
    Write-Host "Content Type: $($response.Headers['Content-Type'])" -ForegroundColor Green
    
    # レスポンスの最初の500文字を表示
    $contentPreview = if ($response.Content.Length -gt 500) {
        $response.Content.Substring(0, 500) + "..."
    } else {
        $response.Content
    }
    
    Write-Host "Content Preview:" -ForegroundColor Green
    Write-Host $contentPreview
    Write-Host ""
    
    # testAccessアクションでテスト
    Write-Host "[Test 2] testAccess action" -ForegroundColor Yellow
    $testUrl = "$apiUrl?action=testAccess"
    $response2 = Invoke-WebRequest -Uri $testUrl -Method GET -ErrorAction Stop
    
    Write-Host "Status Code: $($response2.StatusCode)" -ForegroundColor Green
    Write-Host "Content Length: $($response2.Content.Length)" -ForegroundColor Green
    
    $contentPreview2 = if ($response2.Content.Length -gt 500) {
        $response2.Content.Substring(0, 500) + "..."
    } else {
        $response2.Content
    }
    
    Write-Host "Content Preview:" -ForegroundColor Green
    Write-Host $contentPreview2
    Write-Host ""
    
    # getServerNamesアクションでテスト
    Write-Host "[Test 3] getServerNames action" -ForegroundColor Yellow
    $serverUrl = "$apiUrl?action=getServerNames"
    $response3 = Invoke-WebRequest -Uri $serverUrl -Method GET -ErrorAction Stop
    
    Write-Host "Status Code: $($response3.StatusCode)" -ForegroundColor Green
    Write-Host "Content Length: $($response3.Content.Length)" -ForegroundColor Green
    
    $contentPreview3 = if ($response3.Content.Length -gt 500) {
        $response3.Content.Substring(0, 500) + "..."
    } else {
        $response3.Content
    }
    
    Write-Host "Content Preview:" -ForegroundColor Green
    Write-Host $contentPreview3
    
} catch {
    Write-Host "Error occurred:" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        Write-Host "Status Description: $($_.Exception.Response.StatusDescription)" -ForegroundColor Red
    }
    
    Write-Host "Full Exception:" -ForegroundColor Yellow
    Write-Host $_.Exception.ToString()
}