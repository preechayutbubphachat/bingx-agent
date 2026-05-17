@echo off
setlocal
cd /d C:\bingx-agent
node C:\bingx-agent\run_cycle.js --no-news >> C:\bingx-agent\logs\cycle.log 2>&1
exit /b %ERRORLEVEL%
