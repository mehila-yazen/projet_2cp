from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from src.Backend.extraction_service import extract_pdf_with_page_mapping


def build_output_path(pdf_path: Path, output_dir: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return output_dir / f"{pdf_path.stem}_extraction_{timestamp}.json"


def configure_api_keys(api_key: str | None, api_keys: str | None) -> None:
    if api_keys:
        os.environ["GEMINI_API_KEYS"] = api_keys
    if api_key:
        os.environ["GEMINI_API_KEY"] = api_key


def ensure_api_key_present() -> None:
    one_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    many_keys = (os.getenv("GEMINI_API_KEYS") or "").strip()
    if one_key or many_keys:
        return

    print("Missing Gemini API key.")
    print("Provide one of the following:")
    print("- CLI: --api-key YOUR_KEY")
    print("- CLI: --api-keys KEY1,KEY2,KEY3")
    print("- PowerShell (current terminal): $env:GEMINI_API_KEY=\"YOUR_KEY\"")
    print("- cmd (current terminal): set GEMINI_API_KEY=YOUR_KEY")
    sys.exit(2)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run extraction service on one PDF and save JSON output in tmp/."
    )
    parser.add_argument("pdf_path", help="Path to the PDF file to extract")
    parser.add_argument(
        "--output-dir",
        default="tmp",
        help="Directory where the extraction JSON result will be saved (default: tmp)",
    )
    parser.add_argument(
        "--extractions-dir",
        default="tmp/extractions",
        help="Directory where extracted page images/runs are saved (default: tmp/extractions)",
    )
    parser.add_argument(
        "--output-file",
        default=None,
        help="Optional explicit JSON file path. If omitted, a timestamped file is created in --output-dir.",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="Optional Gemini API key for this run only.",
    )
    parser.add_argument(
        "--api-keys",
        default=None,
        help="Optional comma-separated Gemini API keys for this run only.",
    )
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"Input PDF not found: {pdf_path}")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    configure_api_keys(args.api_key, args.api_keys)
    ensure_api_key_present()

    try:
        extraction_result = extract_pdf_with_page_mapping(
            pdf_path,
            output_root=args.extractions_dir,
        )
    except ValueError as exc:
        if "No API keys provided" in str(exc):
            ensure_api_key_present()
            sys.exit(2)
        raise

    output_path = Path(args.output_file) if args.output_file else build_output_path(pdf_path, output_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    output_path.write_text(
        json.dumps(extraction_result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Extraction completed for: {pdf_path}")
    print(f"Saved extraction JSON to: {output_path}")
    print(
        "Pages status => "
        f"total: {extraction_result.get('total_pages', 0)}, "
        f"ok: {extraction_result.get('ok_pages', 0)}, "
        f"failed: {extraction_result.get('failed_pages', 0)}"
    )


if __name__ == "__main__":
    main()
