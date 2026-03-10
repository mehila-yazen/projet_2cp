# projet_2cp
numerisation des archives

## Requirements
- Python 3.11+
- Poppler (required by `pdf2image`)

## Python libraries
Install the libraries needed by `test.py`:
```bash
pip install -r requirements1.txt
```

## Configure API key
Windows (cmd, current session):
```cmd
set GEMINI_API_KEY=YOUR_KEY
```

Windows (persistent):
```cmd
setx GEMINI_API_KEY "YOUR_KEY"
```
Close and reopen the terminal after `setx`.

## Run
```cmd
python test.py data\yourfile.pdf --output output.json
```

## Notes
- If you get a Poppler error, install Poppler and add it to PATH.
