@echo off
setlocal

set DWC_DIR=c:\Users\live\Documents\Input Shaping\DuetWebControl-3.6-dev
set PLUGIN_ID=OmBrowser

:: %~dp0 has a trailing backslash — strip it for safe quoting
set PLUGIN_REPO=%~dp0
if "%PLUGIN_REPO:~-1%"=="\" set PLUGIN_REPO=%PLUGIN_REPO:~0,-1%

echo Cleaning stale cache...
if exist "%DWC_DIR%\src\plugins\%PLUGIN_ID%" rmdir /s /q "%DWC_DIR%\src\plugins\%PLUGIN_ID%"
del /q "%DWC_DIR%\dist\%PLUGIN_ID%-*.zip" 2>nul
del /q "%DWC_DIR%\dist\js\%PLUGIN_ID%*" 2>nul
del /q "%DWC_DIR%\dist\css\%PLUGIN_ID%*" 2>nul
if exist "%DWC_DIR%\node_modules\.cache" rmdir /s /q "%DWC_DIR%\node_modules\.cache"

echo Building plugin...
cd /d "%DWC_DIR%"
call npm run build-plugin -- "%PLUGIN_REPO%"
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)

for /f "delims=" %%f in ('dir /b /o-d "%DWC_DIR%\dist\%PLUGIN_ID%-*.zip" 2^>nul') do (
    set ZIP=%%f
    goto :found
)
echo No ZIP found in dist\
exit /b 1

:found
echo Copying %ZIP% to plugin repo...
copy /y "%DWC_DIR%\dist\%ZIP%" "%PLUGIN_REPO%\%ZIP%" >nul
echo Done: %PLUGIN_REPO%\%ZIP%
