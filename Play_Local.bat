@echo off
title Operation Quiet Window - Local Server Launcher
echo Starting local web server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
