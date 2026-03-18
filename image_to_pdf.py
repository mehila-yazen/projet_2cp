#!/usr/bin/env python3
"""
Simple image → PDF converter.

Usage:
  python image_to_pdf.py input.jpg
  python image_to_pdf.py input.png -o output.pdf

Accepts common image formats (JPEG, PNG, etc.) and writes a single-page PDF.
"""
from __future__ import annotations

import argparse
import os
import sys
from PIL import Image


def convert_image_to_pdf(input_path: str, output_path: str | None = None) -> str:
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    im = Image.open(input_path)

    # Ensure image is in RGB mode (PDF doesn't support alpha)
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        try:
            alpha = im.split()[-1]
            bg.paste(im, mask=alpha)
        except Exception:
            bg.paste(im)
        im = bg
    else:
        im = im.convert("RGB")

    if output_path is None:
        base = os.path.splitext(input_path)[0]
        output_path = base + ".pdf"

    im.save(output_path, "PDF", resolution=100.0)
    return output_path


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    parser = argparse.ArgumentParser(description="Convert an image to a single-page PDF.")
    parser.add_argument("input", help="Input image file (jpg, png, etc.)")
    parser.add_argument("-o", "--output", help="Output PDF file path (optional)")
    args = parser.parse_args(argv)

    try:
        out = convert_image_to_pdf(args.input, args.output)
        print(f"Saved PDF: {out}")
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
