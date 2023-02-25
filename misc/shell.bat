@echo off

if not defined VS_LOCATION (
   echo Visual Studio location not set.
   exit /B
)

call "%VS_LOCATION%\VC\vcvarsall" x64
set path=%~dp0;%PATH%
set PROJECT_ROOT=%~dp0..\
