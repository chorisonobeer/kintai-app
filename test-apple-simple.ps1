$headers = @{"Content-Type" = "application/json"}
$body = '{"action":"findCustomerByCode","payload":{"customerCode":"apple"},"debug":true}'
Write-Host "Testing apple customer code"
Write-Host "Body: $body"
$response = Invoke-WebRequest -Uri "https://script.google.com/macros/s/AKfycbzpHXHUro64gyHgefdH0OZ0gSLporKeUMnzqiVeu8FNiMvif5bfVCguiLPC788ukpJ87w/exec" -Method POST -Headers $headers -Body $body
Write-Host "Response:"
Write-Host $response.Content