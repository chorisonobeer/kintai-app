param(
    [Parameter(Mandatory=$false)]
    [string]$ServerName = "testserver",
    [switch]$EnableDebug
)

function Test-MasterConfigAPI {
    param(
        [string]$ServerName,
        [bool]$DebugMode = $false
    )
    
    if ($DebugMode) {
        Write-Host "Verbose Mode Enabled" -ForegroundColor Yellow
    }
    
    # MasterConfig.gs API URL - 正しいデプロイURLを使用
    # 注意: このURLは実際のGoogle Apps ScriptのデプロイURLに置き換える必要があります
    $apiUrl = "https://script.google.com/macros/s/AKfycbzOb7Pjukgsk5nyjjl5uaDtGPgHxHIooOHxjHrmGpvNfk1e-8vm_UvSYDg1pZ4QAu4J/exec" # Replace with your actual GAS Web App URL
    Write-Host "Initial API URL: $apiUrl" -ForegroundColor Magenta # Added for debugging
    
    Write-Host "Testing MasterConfig.gs API..." -ForegroundColor Cyan
    Write-Host "API URL (used for requests): $apiUrl" -ForegroundColor Gray # Clarified this is the base for requests
    Write-Host "Server Name: $ServerName" -ForegroundColor Gray
    Write-Host ""
    
    try {
        # Test 1: Basic Access Test
        Write-Host "[Test 1] Basic Access Test" -ForegroundColor Yellow
        $action1 = "testAccess"
        $testUrl = "$($apiUrl)?action=$($action1)"
        Write-Host "  Base API URL: $($apiUrl)" -ForegroundColor Gray
        Write-Host "  Action: $($action1)" -ForegroundColor Gray
        Write-Host "  Final Request URL for Test 1 (Invoke-RestMethod): $($testUrl)" -ForegroundColor Magenta
        
        $response1 = Invoke-RestMethod -Uri $testUrl -Method GET -ErrorAction Stop -Verbose
        Write-Host "Response:" -ForegroundColor Green
        $response1 | ConvertTo-Json -Depth 10 | Write-Host
        Write-Host ""
        
        # Test 2: Get Server Names
        Write-Host "[Test 2] Get Server Names" -ForegroundColor Yellow
        $action2 = "getServerNames"
        $serverUrl = "$($apiUrl)?action=$($action2)"
        Write-Host "  Base API URL: $($apiUrl)" -ForegroundColor Gray
        Write-Host "  Action: $($action2)" -ForegroundColor Gray
        Write-Host "  Final Request URL for Test 2 (Invoke-RestMethod): $($serverUrl)" -ForegroundColor Magenta
        
        $response2 = Invoke-RestMethod -Uri $serverUrl -Method GET -ErrorAction Stop -Verbose
        Write-Host "Response:" -ForegroundColor Green
        $response2 | ConvertTo-Json -Depth 10 | Write-Host
        Write-Host ""
        
        # Test 3: Find Customer by Code (GET)
        Write-Host "[Test 3] Find Customer by Code (GET)" -ForegroundColor Yellow
        $action3 = "findCustomerByCode"
        $customerCode3 = $ServerName
        $customerUrl = "$($apiUrl)?action=$($action3)&customerCode=$($customerCode3)"
        Write-Host "  Base API URL: $($apiUrl)" -ForegroundColor Gray
        Write-Host "  Action: $($action3)" -ForegroundColor Gray
        Write-Host "  Customer Code: $($customerCode3)" -ForegroundColor Gray
        Write-Host "  Final Request URL for Test 3 (Invoke-RestMethod): $($customerUrl)" -ForegroundColor Magenta
        
        $response3 = Invoke-RestMethod -Uri $customerUrl -Method GET -ErrorAction Stop -Verbose
        Write-Host "Response:" -ForegroundColor Green
        $response3 | ConvertTo-Json -Depth 10 | Write-Host
        Write-Host ""
        
        # Test 4: Find Customer by Code (POST)
        Write-Host "[Test 4] Find Customer by Code (POST)" -ForegroundColor Yellow
        Write-Host "  Base API URL (for POST): $($apiUrl)" -ForegroundColor Gray
        Write-Host "  Final Request URL for Test 4 (Invoke-RestMethod): $($apiUrl)" -ForegroundColor Magenta
        $headers = @{
            "Content-Type" = "application/json"
        }
        
        $body = @{
            action = "findCustomerByCode"
            customerCode = $ServerName
        } | ConvertTo-Json
        
        Write-Host "Request Body: $body" -ForegroundColor Gray
        
        $response4 = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $body -ErrorAction Stop -Verbose
        Write-Host "Response:" -ForegroundColor Green
        $response4 | ConvertTo-Json -Depth 10 | Write-Host
        Write-Host ""
        
        Write-Host "All tests completed successfully!" -ForegroundColor Green
        return $true
        
    } catch {
        Write-Host "API Test Failed:" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        
        if ($_.Exception.Response) {
            Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
            Write-Host "Status Description: $($_.Exception.Response.StatusDescription)" -ForegroundColor Red
        }
        
        if ($DebugMode) {
            Write-Host "Full Exception Details:" -ForegroundColor Yellow
            Write-Host $_.Exception.ToString() -ForegroundColor Yellow
        }
        
        return $false
    }
}

# Main execution
try {
    $result = Test-MasterConfigAPI -ServerName $ServerName -DebugMode $EnableDebug.IsPresent
    
    if ($result) {
        Write-Host "MasterConfig API test completed successfully" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "MasterConfig API test failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Unexpected error occurred: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}