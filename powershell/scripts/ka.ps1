param([int]$Minutes = 6000)

$shell = New-Object -ComObject WScript.Shell

for ($i = 0; $i -lt $Minutes; $i++) {
    Start-Sleep -Seconds 60
    # Scroll Lock toggles a status LED without affecting any focused window
    $shell.SendKeys('{SCROLLLOCK}{SCROLLLOCK}')
}
