@echo off
cd /d "%~dp0"
echo Starting DFAB Engineering Ballooning...
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
pause
