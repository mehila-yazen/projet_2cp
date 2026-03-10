from google import genai
from google.genai import types
import argparse
import base64
import json
import os
import re
import sys
from pdf2image import convert_from_path
from pathlib import Path

# -----------------------------
# CONFIG
# -----------------------------
API_KEY_ENV = "GEMINI_API_KEY"
_api_key = os.getenv(API_KEY_ENV)
if not _api_key:
    print(f"Missing API key. Set {API_KEY_ENV} in your environment.")
    sys.exit(1)

client = genai.Client(api_key=_api_key)

# -----------------------------
# Convert PDF → Image + Rotate
# -----------------------------
def pdf_to_image(pdf_path):
    images = convert_from_path(pdf_path, dpi=200)
    image = images[0]
    # keep original orientation

    image_path = Path("temp_page.png")
    image.save(image_path, "PNG")
    return image_path


# -----------------------------
# Clean JSON
# -----------------------------
def clean_json(text):
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group())
    return None


# -----------------------------
# Validate
# -----------------------------
def validate(data):
    if not data:
        return False
    for m in data.get("modules", []):
        for field in ["note_s1", "note_s2"]:
            val = m.get(field)
            if val is not None and not (0 <= val <= 20):
                return False
    return True


def coerce_number(val):
    """Coerce numeric-like strings to float (accept comma as decimal)."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return val
    s = str(val).strip()
    if s == "":
        return None
    s = s.replace(',', '.')
    m = re.match(r"^[-+]?[0-9]*\.?[0-9]+", s)
    if m:
        try:
            return float(m.group(0))
        except:
            return None
    return None


def postprocess(data):
    if not data:
        return data
    for m in data.get('modules', []):
        for key in ['coef_s1', 'coef_s2']:
            m[key] = coerce_number(m.get(key))
        for key in ['note_s1', 'note_s2']:
            m[key] = coerce_number(m.get(key))
    summary = data.get('summary') or {}
    for key in ['semestre1_moyenne', 'semestre2_moyenne', 'general_moyenne']:
        summary[key] = coerce_number(summary.get(key))
    for key in ['semestre1_rang', 'semestre2_rang', 'general_rang']:
        v = summary.get(key)
        if v is None:
            summary[key] = None
        else:
            try:
                summary[key] = int(float(str(v).replace(',', '.')))
            except:
                summary[key] = None
    data['summary'] = summary
    return data


# -----------------------------
# Extraction
# -----------------------------
def extract_bulletin_from_pdf(pdf_path):

    image_path = pdf_to_image(pdf_path)

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    prompt = """
    you are a text extractor of old scanned documents  that contains student informations
    some documents are not clear and some fields can be empty, you have to extract the data as accurate as possible and return null for empty fields, do not replace empty fields with other values
    a document page either has informtions about only one student or a big table that handle ore than one student 
 Extract this French academic bulletin into STRICT JSON.

        Return ONLY valid JSON.

        Structure:
        {
            "student": {
                "name": "",
                "group": "",
                "section": "",
                "year": ""
            },
            "modules": [
                {
                    "name": "",
                    "coef_s1": number|null,
                    "note_s1": number|null,
                    "coef_s2": number|null,
                    "note_s2": number|null
                }
            ],
            "summary": {
                "semestre1_moyenne": number|null,
                "semestre1_rang": number|null,
                "semestre2_moyenne": number|null,
                "semestre2_rang": number|null,
                "general_moyenne": number|null,
                "general_rang": number|null
            }
        note : coef and note fields in both semestres can be empty ,return null for empty fields , do not replace empty fields with other values
    """

    response = client.models.generate_content(
        model="models/gemini-2.5-flash",
        contents=[
            prompt,
            types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/png"
            )
        ]
    )

    result = postprocess(clean_json(response.text))

    if validate(result):
        print("Success with 2.5 Flash ✅")
        return result

    # fallback: try again with the same 2.5 model (keeps behavior compatible)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            prompt,
            types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/png"
            )
        ]
    )

    result = postprocess(clean_json(response.text))

    if validate(result):
        print("Success with 2.5 Flash ✅")
        return result

    return None


# -----------------------------
# MAIN
# -----------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract bulletin JSON from a PDF.")
    parser.add_argument("pdf_path", help="Path to the input PDF")
    parser.add_argument(
        "--output",
        default="output10.json",
        help="Path to write JSON (default: output.json)",
    )
    args = parser.parse_args()

    result = extract_bulletin_from_pdf(args.pdf_path)

    if result:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"Saved to {args.output}")
    else:
        print("Extraction failed.")