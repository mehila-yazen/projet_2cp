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
import difflib

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
    if not images:
        return []
    image_paths = []
    for idx, image in enumerate(images):
        image_path = Path(f"temp_page_{idx}.png")
        image.save(image_path, "PNG")
        image_paths.append(image_path)
    return image_paths


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

    image_paths = pdf_to_image(pdf_path)
    if not image_paths:
        print("No pages found in PDF")
        return None

    results = []

    prompt = """
    This PDF contains multiple pages. Each page has the same structure and contains the bulletin for a single student (different student on each page).

    You will be given ONE page image at a time. Extract the student information from THIS page only. Do NOT assume multiple students on a page.

    You are a text extractor of old scanned documents that contain student information. Some documents are not clear and some fields can be empty; return null for empty fields and do not replace them.

    Extract this French academic bulletin into STRICT JSON for the single student on the provided page.

    Structure:
    {
        "student": {
            "name": "",
            "group": "",
            "section": "",
            "year": "",
            "matricule": "",
            "moyenneAnterieur": number|null
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
        "notesConcours": {
            "mathematique": number|null,
            "cultureGenerale": number|null,
            "testPsychologique": number|null
         },
        "summary": {
            "semestre1_moyenne": number|null,
            "semestre1_rang": number|null,
            "semestre2_moyenne": number|null,
            "semestre2_rang": number|null,
            "general_moyenne": number|null,
            "general_rang": number|null,
            "observation": string|null
        },
        "error": string|null
    }
    Note: coef and note fields in both semesters can be empty — return null for empty fields; do not replace empty fields with other values.
    """

    for image_path in image_paths:
        with open(image_path, "rb") as f:
            image_bytes = f.read()

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
            print(f"Success with 2.5 Flash ✅  ({image_path})")
            results.append(result)
            continue

        # fallback: try again with the same model
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
            print(f"Success with 2.5 Flash ✅  ({image_path})")
            results.append(result)
            continue

        print(f"Extraction failed for page: {image_path}")

    if not results:
        return None

    # Propagate `section` from the first (or second) student to others missing it.
    if isinstance(results, list) and len(results) >= 1:
        chosen_section = None
        # Try first student
        first = results[0]
        if isinstance(first, dict):
            student_block = first.get('student') if isinstance(first.get('student'), dict) else {}
            s = student_block.get('section') if student_block else None
            if s and str(s).strip():
                chosen_section = s

        # If none, try second student
        if not chosen_section and len(results) > 1:
            second = results[1]
            if isinstance(second, dict):
                student_block = second.get('student') if isinstance(second.get('student'), dict) else {}
                s2 = student_block.get('section') if student_block else None
                if s2 and str(s2).strip():
                    chosen_section = s2

        # Apply chosen_section to any student missing it
        if chosen_section:
            applied = 0
            for rec in results:
                if not isinstance(rec, dict):
                    continue
                stud = rec.get('student')
                if isinstance(stud, dict):
                    if not stud.get('section') or str(stud.get('section')).strip() == "":
                        stud['section'] = chosen_section
                        applied += 1
            if applied:
                print(f"Applied section '{chosen_section}' to {applied} student(s)")

        # Build a reference list of module NAMES from the first (or second) student
        ref_modules = None
        ref_index = None
        for ix in (0, 1):
            if ix < len(results):
                r = results[ix]
                mods = r.get('modules') if isinstance(r.get('modules'), list) else []
                names = [ (m.get('name') or '').strip().upper() for m in mods if isinstance(m, dict) and (m.get('name') or '').strip() ]
                if names:
                    ref_modules = names
                    ref_index = ix
                    break

        if ref_modules:
            mismatches = 0
            fixed_total = 0
            for rec in results:
                mods = rec.get('modules') if isinstance(rec.get('modules'), list) else []
                names = [ (m.get('name') or '').strip().upper() for m in mods if isinstance(m, dict) and (m.get('name') or '').strip() ]
                match = (names == ref_modules)
                # annotate result with a boolean flag
                rec['modules_match_reference'] = bool(match)

                # If lengths match, compare by index and attempt fuzzy fixes
                fixed = 0
                if isinstance(mods, list) and len(mods) == len(ref_modules):
                    for i in range(len(mods)):
                        mod = mods[i]
                        if not isinstance(mod, dict):
                            continue
                        name = (mod.get('name') or '').strip()
                        norm_name = name.upper()
                        ref_name = ref_modules[i]
                        if norm_name != ref_name:
                            # conservative fuzzy match: sequence matcher ratio
                            ratio = difflib.SequenceMatcher(None, norm_name, ref_name).ratio()
                            if ratio >= 0.75:
                                mod['name'] = ref_name
                                fixed += 1
                else:
                    # fallback: try to map each module name to the closest ref name
                    for mod in mods:
                        if not isinstance(mod, dict):
                            continue
                        name = (mod.get('name') or '').strip()
                        if not name:
                            continue
                        norm_name = name.upper()
                        close = difflib.get_close_matches(norm_name, ref_modules, n=1, cutoff=0.75)
                        if close:
                            mod['name'] = close[0]
                            fixed += 1

                if fixed:
                    fixed_total += fixed
                    # mark as fixed (still check other mismatches)
                    rec['modules_match_reference'] = True
                if not rec['modules_match_reference']:
                    mismatches += 1
                    existing = rec.get('unsure_fields') if isinstance(rec.get('unsure_fields'), list) else []
                    if 'modules' not in existing:
                        existing.append('modules')
                    rec['unsure_fields'] = existing
                    rec['unsure'] = True

            print(f"Module reference taken from page {ref_index+1}; fixed {fixed_total} module name(s); {len(results)-mismatches}/{len(results)} students matched module names")

        # Enforce `year` field to be strictly YYYY/YYYY with consecutive years; otherwise set to None
        year_re = re.compile(r'^(\d{4})/(\d{4})$')
        for rec in results:
            stud = rec.get('student') if isinstance(rec.get('student'), dict) else None
            if not stud:
                continue
            y = stud.get('year')
            if not isinstance(y, str):
                stud['year'] = None
                continue
            m = year_re.match(y.strip())
            if not m:
                stud['year'] = None
                continue
            try:
                y1 = int(m.group(1))
                y2 = int(m.group(2))
                if y2 != y1 + 1:
                    stud['year'] = None
            except Exception:
                stud['year'] = None

    if len(results) == 1:
        return results[0]
    return results


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