@echo off
rem Exhibition mode: local server + Chrome kiosk on the Czech touchscreen page.
cd /d "%~dp0"
start "ws2-expo-server" /min node tools\serve.mjs 8080
timeout /t 2 /nobreak >nul
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
start "" %CHROME% --kiosk --app="http://127.0.0.1:8080/expo.html?kiosk=1" --noerrdialogs --disable-infobars --disable-pinch --overscroll-history-navigation=0 --disable-features=Translate --check-for-update-interval=31536000 --user-data-dir="%LOCALAPPDATA%\ws2-expo-profile"
