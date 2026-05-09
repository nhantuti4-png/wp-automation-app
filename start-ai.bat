@echo off
title AI Studio - Local Bridge Control [DEBUG MODE]
setlocal enabledelayedexpansion

:: Set colors (Cyan on Black for Debug)
color 0B

echo ===================================================
echo        AI STUDIO DEBUG STARTUP SYSTEM
echo ===================================================
echo.

cd /d %~dp0

echo [DEBUG] Current Directory: %CD%
echo [DEBUG] Script Path: %~f0

:: Check for node_modules
if not exist node_modules (
    echo [Setup] node_modules not found. Installing dependencies...
    call npm install
)

echo [1/3] Starting Local Persistence Agent (FOREGROUND)...
echo [INFO] Press Ctrl+C to stop the agent.
echo.

:: Launch in foreground as requested
node local-agent.js

:: If the node process exits, the script continues here
echo.
echo ===================================================
echo   LOCAL AGENT EXITED
echo ===================================================
pause
