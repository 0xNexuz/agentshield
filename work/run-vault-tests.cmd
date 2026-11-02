@echo off
setlocal
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
set "CARGO_HOME=%~dp0..\.cargo-home"
set "AWS_LC_SYS_PREBUILT_NASM=1"
cargo --config "%~dp0cargo-offline.toml" test --manifest-path "%~dp0..\contracts\vault\Cargo.toml" --offline
exit /b %ERRORLEVEL%
