# 簡単なテストスクリプト

# ヘッダー設定
$headers = @{
    'Content-Type' = 'application/json'
}

# testAccessテスト
Write-Host "=== testAccess テスト ==="
$testBody = '{"action":"testAccess"}'
Write-Host "送信データ: $testBody"

try {
    $response1 = Invoke-WebRequest -Uri 'https://script.google.com/macros/s/AKfycbzpHXHUro64gyHgefdH0OZ0gSLporKeUMnzqiVeu8FNiMvif5bfVCguiLPC788ukpJ87w/exec' -Method POST -Headers $headers -Body $testBody
    Write-Host "レスポンス:"
    Write-Host $response1.Content
} catch {
    Write-Host "エラー: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== findCustomerByCode テスト ==="

# findCustomerByCodeテスト
$customerBody = '{"action":"findCustomerByCode","payload":{"customerCode":"test123"},"debug":true}'
Write-Host "送信データ: $customerBody"

try {
    $response2 = Invoke-WebRequest -Uri 'https://script.google.com/macros/s/AKfycbzpHXHUro64gyHgefdH0OZ0gSLporKeUMnzqiVeu8FNiMvif5bfVCguiLPC788ukpJ87w/exec' -Method POST -Headers $headers -Body $customerBody
    Write-Host "レスポンス:"
    Write-Host $response2.Content
} catch {
    Write-Host "エラー: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "テスト完了"