#!/usr/bin/env bash
# Builds dist/ws2-offline/ (+ .zip): the exhibition app for a venue computer that stays offline.
# Needs only Chrome or Edge on the venue machine (no Node, no Python, no internet).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist/ws2-offline
rm -rf "$OUT"; mkdir -p "$OUT"
cp -r expo.html expo.css js data audio img fonts "$OUT"/
cat > "$OUT/START-EXPO.bat" <<'BAT'
@echo off
rem MUZE HMOTA POCITAT? - offline exhibition launcher (Windows). Needs Chrome or Edge, no internet.
rem Close the piece with Alt+F4. To start it automatically with Windows, put a shortcut to this file into shell:startup.
setlocal
set "HERE=%~dp0"
set "URL=file:///%HERE:\=/%expo.html?kiosk=1"
set "FLAGS=--kiosk --allow-file-access-from-files --noerrdialogs --disable-infobars --disable-pinch --overscroll-history-navigation=0 --disable-features=Translate --check-for-update-interval=31536000 --no-first-run --autoplay-policy=no-user-gesture-required"
set "BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" set "BROWSER=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" ( echo Chrome or Edge not found. & pause & exit /b 1 )
:loop
"%BROWSER%" %FLAGS% --user-data-dir="%LOCALAPPDATA%\ws2-expo-profile" --app="%URL%"
rem if the browser is closed by accident or crashes, start again (use Alt+F4 then close this window to really quit)
timeout /t 3 /nobreak >nul
goto loop
BAT
cat > "$OUT/START-EXPO-window.bat" <<'BAT'
@echo off
rem Same piece in a normal window (for testing, not full screen).
setlocal
set "HERE=%~dp0"
set "BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
"%BROWSER%" --allow-file-access-from-files --user-data-dir="%LOCALAPPDATA%\ws2-expo-profile-test" --app="file:///%HERE:\=/%expo.html"
BAT
cat > "$OUT/README-OFFLINE.txt" <<'TXT'
MŮŽE HMOTA POČÍTAT? - offline version for the venue computer

1. Copy this whole folder anywhere on the computer (e.g. C:\expo). Internet is not needed, ever.
2. Double-click START-EXPO.bat. It opens full screen in Chrome (or Edge) and restarts itself if the browser closes.
   Alt+F4 closes the browser; close the black window too to really quit.
   START-EXPO-window.bat opens a normal window for testing.
3. Start automatically after power-on: press Win+R, type shell:startup, put a shortcut to START-EXPO.bat there.
   Also set Windows to log in automatically, turn off sleep and screen-off, and silence notifications.
4. Sound: set the system volume once; the page plays sound only after a visitor touches the screen.
   The voice reading the cards uses the voices installed in Windows (Czech voice recommended; Settings > Time & language > Speech).
5. Touch screen: touch only; the cursor is hidden. The lab address on the page is plain text in this mode (QR codes need a phone, which does not matter in the piece itself).
6. Update: replace the folder content with a newer build; nothing is stored between visits.

Everything shown is a simulation or a pre-recorded measurement; nothing here is connected to the real samples.
Images: SEM image credit Vojtěch Jeremiáš Kundrát (shown on the page).
TXT
(cd dist && rm -f ws2-offline.zip && powershell -NoProfile -Command "Compress-Archive -Path ws2-offline -DestinationPath ws2-offline.zip") 
du -sh "$OUT" dist/ws2-offline.zip
