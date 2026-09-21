#!/usr/bin/env python3
"""Extract linked Grundfos product rows from the official Ukrainian price list."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pdfplumber
from pypdf import PdfReader


PRODUCT_NUMBER = re.compile(r"[?&]productnumber=([A-Z0-9]+)", re.IGNORECASE)


def linked_rows(pdf_path: Path) -> list[dict[str, object]]:
    reader = PdfReader(pdf_path)
    records: list[dict[str, object]] = []
    seen: set[str] = set()

    with pdfplumber.open(pdf_path) as document:
        for page_index, (pdf_page, layout_page) in enumerate(zip(reader.pages, document.pages)):
            words = layout_page.extract_words(use_text_flow=True, keep_blank_chars=False)
            page_height = float(pdf_page.mediabox.height)
            for annotation_ref in pdf_page.get("/Annots") or []:
                annotation = annotation_ref.get_object()
                uri = annotation.get("/A", {}).get("/URI", "")
                match = PRODUCT_NUMBER.search(uri)
                if not match or "products.gotoproduct" not in uri:
                    continue
                product_number = match.group(1)
                if product_number in seen:
                    continue
                seen.add(product_number)

                rect = [float(value) for value in annotation.get("/Rect", [0, 0, 0, 0])]
                annotation_top = page_height - max(rect[1], rect[3])
                annotation_bottom = page_height - min(rect[1], rect[3])
                centre = (annotation_top + annotation_bottom) / 2
                row_words = [
                    word
                    for word in words
                    if float(word["top"]) - 3 <= centre <= float(word["bottom"]) + 3
                ]
                row_words.sort(key=lambda word: float(word["x0"]))
                row_text = " ".join(str(word["text"]) for word in row_words).strip()
                records.append(
                    {
                        "productNumber": product_number,
                        "page": page_index + 1,
                        "rowText": row_text,
                        "sourceUrl": uri,
                    }
                )
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    records = linked_rows(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"products": len(records), "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
