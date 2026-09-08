@echo off
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
set "ANDROID_HOME=C:\Users\diarl\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"
cd /d "%~dp0"
call npm run build
if errorlevel 1 exit /b 1
call npx cap sync android
if errorlevel 1 exit /b 1
cd /d "%~dp0android"
echo Building signed KOS release APK...
call .\gradlew.bat assembleRelease
echo.
echo APK: android\app\build\outputs\apk\release\app-release.apk
echo Suba esse arquivo como asset da release no GitHub (tag = versao, ex: v1.0.1)
