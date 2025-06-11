# デバッグ用のテストスクリプト
$headers = @{
    'Content-Type' = 'application/json'
}

# より簡単なテストケース
$body = @{
    action = 'testAccess'
} | ConvertTo-Json -Depth 3

Write-Host "Testing testAccess first:"
Write-Host $body
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri 'https://script.google.com/macros/s/AKfycbzpHXHUro64gyHgefdH0OZ0gSLporKeUMnzqiVeu8FNiMvif5bfVCguiLPC788ukpJ87w/exec' -Method POST -Headers $headers -Body $body
    Write-Host "testAccess Response:"
    Write-Host $response.Content
    Write-Host ""
} catch {
    Write-Host "testAccess Error:"
    Write-Host $_.Exception.Message
}

# 顧客検索テスト
$body2 = @{
    action = 'findCustomerByCode'
    payload = @{
        customerCode = 'test123'
    }
    debug = $true
} | ConvertTo-Json -Depth 3

Write-Host "Testing findCustomerByCode:"
Write-Host $body2
Write-Host ""

try {
    $response2 = Invoke-WebRequest -Uri 'https://script.google.com/macros/s/AKfycbzpHXHUro64gyHgefdH0OZ0gSLporKeUMnzqiVeu8FNiMvif5bfVCguiLPC788ukpJ87w/exec' -Method POST -Headers $headers -Body $body2
    Write-Host "findCustomerByCode Response:"
    Write-Host $response2.Content
} catch {
    Write-Host "findCustomerByCode Error:"
    Write-Host $_.Exception.Message
}