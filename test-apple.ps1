# Apple顧客コードでのテスト

$headers = @{
    "Content-Type" = "application/json"
}

# Test with apple customer code
Write-Host "=== Apple顧客コードテスト ==="
$body = @"
{"action":"findCustomerByCode","payload":{"customerCode":"apple"},"debug":true}
"@

Write-Host "Request Body: $body"
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri "https://script.google.com/macros/s/AKfycbzpHXHUro64gyHgefdH0OZ0gSLporKeUMnzqiVeu8FNiMvif5bfVCguiLPC788ukpJ87w/exec" -Method POST -Headers $headers -Body $body
    Write-Host "Response Status: $($response.StatusCode)"
    Write-Host "Response Content:"
    Write-Host $response.Content
    Write-Host ""
    
    # JSONレスポンスを解析
    try {
        $jsonResponse = $response.Content | ConvertFrom-Json
        Write-Host "=== 解析されたレスポンス ==="
        Write-Host "Success: $($jsonResponse.success)"
        if ($jsonResponse.success) {
            Write-Host "Customer Found: $($jsonResponse.customer -ne $null)"
            if ($jsonResponse.customer) {
                Write-Host "Customer Name: $($jsonResponse.customer.customerName)"
                Write-Host "Company Name: $($jsonResponse.customer.companyName)"
                Write-Host "Server Name: $($jsonResponse.customer.serverName)"
                Write-Host "Spreadsheet ID: $($jsonResponse.customer.spreadsheetId)"
            }
        } else {
            Write-Host "Error: $($jsonResponse.error)"
            Write-Host "Message: $($jsonResponse.message)"
        }
    } catch {
        Write-Host "JSON解析エラー: $($_.Exception.Message)"
    }
} catch {
    Write-Host "Request Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)"
    }
}

Write-Host ""
Write-Host "テスト完了"