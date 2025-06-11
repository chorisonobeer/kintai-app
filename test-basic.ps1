# Basic test script
$headers = @{
    "Content-Type" = "application/json"
}

# Test 1: testAccess
Write-Host "=== testAccess Test ==="
$body1 = @"
{"action":"testAccess"}
"@

Write-Host "Request Body: $body1"

try {
    $response1 = Invoke-WebRequest -Uri "https://script.google.com/macros/s/AKfycbzpHXHUro64gyHgefdH0OZ0gSLporKeUMnzqiVeu8FNiMvif5bfVCguiLPC788ukpJ87w/exec" -Method POST -Headers $headers -Body $body1
    Write-Host "Response:"
    Write-Host $response1.Content
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== findCustomerByCode Test ==="

# Test 2: findCustomerByCode
$body2 = @"
{"action":"findCustomerByCode","payload":{"customerCode":"test123"},"debug":true}
"@

Write-Host "Request Body: $body2"

try {
    $response2 = Invoke-WebRequest -Uri "https://script.google.com/macros/s/AKfycbzpHXHUro64gyHgefdH0OZ0gSLporKeUMnzqiVeu8FNiMvif5bfVCguiLPC788ukpJ87w/exec" -Method POST -Headers $headers -Body $body2
    Write-Host "Response:"
    Write-Host $response2.Content
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Test completed"