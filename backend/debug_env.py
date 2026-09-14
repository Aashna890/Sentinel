"""
Run this from your backend/ folder:
  python debug_env.py

It will tell you exactly why the key isn't loading.
"""

import os
import sys
from pathlib import Path

print("=" * 60)
print("Sentinel — API Key Diagnostic")
print("=" * 60)

# 1. Where is this script running from?
cwd = Path.cwd()
print(f"\n[1] Working directory : {cwd}")
print(f"[2] Script location   : {Path(__file__).resolve().parent}")

# 2. Find .env files
candidates = [
    cwd / ".env",
    cwd / "backend" / ".env",
    Path(__file__).resolve().parent / ".env",
]
print("\n[3] Searching for .env files:")
found_env = None
for p in candidates:
    exists = p.exists()
    print(f"    {'✓' if exists else '✗'} {p}")
    if exists and not found_env:
        found_env = p

# 3. Read .env raw
if found_env:
    print(f"\n[4] Reading {found_env}:")
    lines = found_env.read_text().splitlines()
    for line in lines:
        if line.strip().startswith("#") or not line.strip():
            continue
        key = line.split("=")[0].strip()
        val = line.split("=", 1)[1].strip() if "=" in line else ""
        # Mask value but show length and first/last char
        if val:
            masked = val[0] + "*" * (len(val) - 2) + val[-1] if len(val) > 2 else "**"
            print(f"    {key} = {masked}  (len={len(val)})")
        else:
            print(f"    {key} = (EMPTY)")
else:
    print("\n[4] ✗ No .env file found in any expected location!")
    print("    Create backend/.env with:  GEMINI_API_KEY=your_key_here")

# 4. Try loading it
print("\n[5] Testing load_dotenv():")
try:
    from dotenv import load_dotenv
    if found_env:
        result = load_dotenv(found_env, override=True)
        print(f"    load_dotenv returned: {result}")
    else:
        result = load_dotenv(override=True)
        print(f"    load_dotenv (auto)  : {result}")
except ImportError:
    print("    ✗ python-dotenv not installed! Run: pip install python-dotenv")
    sys.exit(1)

# 5. Check the key after loading
key = os.environ.get("GEMINI_API_KEY", "")
if key:
    masked = key[:6] + "*" * (len(key) - 10) + key[-4:] if len(key) > 10 else "***"
    print(f"\n[6] ✓ GEMINI_API_KEY loaded: {masked}  (len={len(key)})")
else:
    print("\n[6] ✗ GEMINI_API_KEY is still empty after load_dotenv!")
    print("    Check the variable name in your .env — it must be exactly:")
    print("    GEMINI_API_KEY=AIza...")

# 6. Quick live API test
if key:
    print("\n[7] Testing Gemini API call (gemini-1.5-flash)...")
    try:
        import urllib.request, json
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
        data = json.dumps({
            "contents": [{"role": "user", "parts": [{"text": "Reply with just the word: OK"}]}],
            "generationConfig": {"temperature": 0, "maxOutputTokens": 5}
        }).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as r:
            body = json.loads(r.read())
        reply = body["candidates"][0]["content"]["parts"][0]["text"].strip()
        print(f"    ✓ API responded: '{reply}'  — key is valid and model works!")
    except urllib.error.HTTPError as e:
        err = json.loads(e.read())
        print(f"    ✗ HTTP {e.code}: {err.get('error', {}).get('message', str(err))}")
        if e.code == 400:
            print("    → Key may be invalid or billing not enabled")
        elif e.code == 403:
            print("    → Key doesn't have Generative Language API permission")
    except Exception as e:
        print(f"    ✗ Request failed: {e}")

print("\n" + "=" * 60)