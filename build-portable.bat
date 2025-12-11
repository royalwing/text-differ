@echo off
echo Installing dependencies...
call npm.cmd install

echo Patching 7za to skip symlinks...
set "SEVENZA_DIR=%CD%\node_modules\7zip-bin\win\x64"
if not exist "%SEVENZA_DIR%\7za-original.exe" (
    echo Renaming 7za.exe to 7za-original.exe
    ren "%SEVENZA_DIR%\7za.exe" "7za-original.exe"
)

echo Copying wrapper...
copy /Y "7za_wrapper.exe" "%SEVENZA_DIR%\7za.exe"

echo Building portable executable...
set "ELECTRON_BUILDER_CACHE=%CD%\cache"
call npm.cmd run dist

echo Done.
pause
