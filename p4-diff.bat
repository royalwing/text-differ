@echo off
:: Wrapper script for Perforce Helix Core (P4) Diff Tool
:: Configure P4V to use this script as the Diff application.
:: Arguments: %1 %2

:: Launch text-differ with the provided files
"%~dp0built\text-differ.exe" %1 %2
