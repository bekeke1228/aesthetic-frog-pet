# 关闭正在运行的旧版桌宠（只匹配本项目的 electron.exe，不影响其他软件）
$cwd = (Get-Location).Path
Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$cwd*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 600
