@echo off
title Coupon Blog Local Bridge
echo Starting Local Persistence Bridge...
cd /d %~dp0
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)
node local-agent.js
pause
