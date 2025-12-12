@echo off
REM Minimal ct wrapper for Windows
REM This repository expects: ct start -- <command...>
node "%~dp0tools\\ct-cli.mjs" %*

