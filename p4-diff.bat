@echo off
:: Wrapper script for Perforce Helix Core (P4) Diff Tool
:: Configure P4V to use this script as the Diff application.
:: Arguments: %*

:: Launch text-differ with the provided files
"%~dp0dist\text-differ.exe" %*
