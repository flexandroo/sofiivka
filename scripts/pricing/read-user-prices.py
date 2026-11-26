"""Read price workbooks without Excel, macros, external links or recalculation.

OOXML is read directly to preserve original cached numeric text/formulas. BIFF XLS
uses xlrd only for its otherwise unsupported legacy format; the OLE/BIFF scan
records formula locations/tokens and never interprets attached instructions.
"""
import argparse
import base64
import hashlib
import json
import pathlib
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile


def read_ole_stream(data, wanted="Workbook"):
    if data[:8] != bytes.fromhex("d0cf11e0a1b11ae1"):
        raise ValueError("Not an OLE compound file")
    sector_size = 1 << struct.unpack_from("<H", data, 30)[0]
    mini_size = 1 << struct.unpack_from("<H", data, 32)[0]
    sector_count = len(data) // sector_size

    def sector(number):
        if not 0 <= number < sector_count:
            raise ValueError("Invalid OLE sector")
        start = (number + 1) * sector_size
        return data[start:start + sector_size]

    difat = list(struct.unpack_from("<109I", data, 76))
    difat_next, difat_count = struct.unpack_from("<II", data, 68)
    for _ in range(difat_count):
        block = struct.unpack("<%dI" % (sector_size // 4), sector(difat_next))
        difat.extend(block[:-1])
        difat_next = block[-1]
    fat_count = struct.unpack_from("<I", data, 44)[0]
    fat_sectors = [n for n in difat if n < 0xFFFFFFFA][:fat_count]
    fat = []
    for number in fat_sectors:
        fat.extend(struct.unpack("<%dI" % (sector_size // 4), sector(number)))

    def chain(start, allocation, getter, limit):
        chunks, seen = [], set()
        while start < 0xFFFFFFFA:
            if start in seen or start >= len(allocation) or len(seen) > limit:
                raise ValueError("Cyclic or invalid OLE chain")
            seen.add(start)
            chunks.append(getter(start))
            start = allocation[start]
        return b"".join(chunks)

    directory = chain(struct.unpack_from("<I", data, 48)[0], fat, sector, sector_count)
    entries = []
    for offset in range(0, len(directory) - 127, 128):
        entry = directory[offset:offset + 128]
        name_length = struct.unpack_from("<H", entry, 64)[0]
        if name_length < 2:
            continue
        name = entry[:name_length - 2].decode("utf-16-le")
        entries.append({"name": name, "type": entry[66],
                        "start": struct.unpack_from("<I", entry, 116)[0],
                        "size": struct.unpack_from("<Q", entry, 120)[0]})
    target = next((e for e in entries if e["type"] == 2 and e["name"].lower() in (wanted.lower(), "book")), None)
    if target is None:
        raise ValueError("No Workbook stream")
    cutoff = struct.unpack_from("<I", data, 56)[0]
    if target["size"] >= cutoff:
        stream = chain(target["start"], fat, sector, sector_count)[:target["size"]]
    else:
        root = next(e for e in entries if e["type"] == 5)
        mini_stream = chain(root["start"], fat, sector, sector_count)[:root["size"]]
        mini_fat_bytes = chain(struct.unpack_from("<I", data, 60)[0], fat, sector, sector_count)
        mini_fat = struct.unpack("<%dI" % (len(mini_fat_bytes) // 4), mini_fat_bytes)
        stream = chain(target["start"], mini_fat,
                       lambda n: mini_stream[n * mini_size:(n + 1) * mini_size],
                       len(mini_fat))[:target["size"]]
    return stream, [e["name"] for e in entries]


def biff_formulas(data, sheet_names):
    stream, entries = read_ole_stream(data)
    records, offsets = [], []
    cursor = 0
    while cursor + 4 <= len(stream):
        kind, length = struct.unpack_from("<HH", stream, cursor)
        payload = stream[cursor + 4:cursor + 4 + length]
        if len(payload) != length:
            raise ValueError("Truncated BIFF record")
        if kind == 0x002F:
            raise ValueError("Encrypted XLS is unsupported")
        if kind == 0x0085 and length >= 8:
            offsets.append(struct.unpack_from("<I", payload)[0])
        records.append((cursor, kind, payload))
        cursor += length + 4
    formulas = {}
    for index, start in enumerate(offsets):
        end = min((o for o in offsets if o > start), default=len(stream))
        name = sheet_names[index] if index < len(sheet_names) else str(index)
        for offset, kind, payload in records:
            if start <= offset < end and kind == 0x0006 and len(payload) >= 22:
                row, column = struct.unpack_from("<HH", payload)
                count = struct.unpack_from("<H", payload, 20)[0]
                formulas[(name, row, column)] = {
                    "cachedResultHex": payload[6:14].hex(),
                    "biffTokenBase64": base64.b64encode(payload[22:22 + count]).decode("ascii"),
                    "formulaTextAvailable": False,
                }
    return formulas, {"macroStoragePresent": any(re.search(r"(^vba$|_vba|macros)", n, re.I) for n in entries),
                      "formulaCount": len(formulas), "externalLinksFollowed": False}


def column_number(reference):
    number = 0
    for letter in re.match(r"[A-Z]+", reference).group():
        number = number * 26 + ord(letter) - 64
    return number


def read_xlsx(filename):
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    relns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    with zipfile.ZipFile(filename) as package:
        names = package.namelist()
        strings = []
        if "xl/sharedStrings.xml" in names:
            strings = ["".join(item.itertext()) for item in ET.fromstring(package.read("xl/sharedStrings.xml"))]
        relationships = {item.attrib["Id"]: item.attrib["Target"]
                         for item in ET.fromstring(package.read("xl/_rels/workbook.xml.rels"))}
        workbook = ET.fromstring(package.read("xl/workbook.xml"))
        sheets = []
        formula_count = 0
        for item in workbook.find("m:sheets", ns):
            target = relationships[item.attrib["{%s}id" % relns]]
            member = target.lstrip("/") if target.startswith("/") else "xl/" + target
            tree = ET.fromstring(package.read(member))
            rows = []
            max_column = 0
            for source_row in tree.findall("m:sheetData/m:row", ns):
                cells = []
                for cell in source_row.findall("m:c", ns):
                    address = cell.attrib["r"]
                    raw = cell.find("m:v", ns)
                    raw_text = raw.text if raw is not None else None
                    kind = cell.attrib.get("t", "n")
                    formula = cell.find("m:f", ns)
                    value = None
                    if kind == "s" and raw_text is not None:
                        value = strings[int(raw_text)]
                    elif kind == "inlineStr":
                        value = "".join(cell.find("m:is", ns).itertext())
                    elif kind == "b" and raw_text is not None:
                        value = raw_text == "1"
                    elif raw_text is not None:
                        value = raw_text
                    if value is None and formula is None:
                        continue
                    result = {"column": column_number(address), "address": address,
                              "value": value, "type": kind, "style": cell.attrib.get("s")}
                    if kind == "n" and raw_text is not None:
                        result["numericText"] = raw_text
                    if formula is not None:
                        result["formula"] = formula.text or ""
                        result["formulaAttributes"] = formula.attrib
                        result["cachedValuePresent"] = raw_text is not None
                        formula_count += 1
                    max_column = max(max_column, result["column"])
                    cells.append(result)
                if cells:
                    rows.append({"row": int(source_row.attrib["r"]), "hidden": source_row.attrib.get("hidden") == "1", "cells": cells})
            sheets.append({"name": item.attrib["name"], "state": item.attrib.get("state", "visible"),
                           "rowCount": max((r["row"] for r in rows), default=0), "columnCount": max_column,
                           "rows": rows})
        return {"reader": "bundled Python stdlib OOXML cached-cell extraction", "sheets": sheets,
                "safety": {"macroStoragePresent": any("vbaProject" in n for n in names),
                           "formulaCount": formula_count, "externalLinksPresent": any(n.startswith("xl/externalLinks/") for n in names),
                           "externalLinksFollowed": False, "macrosExecuted": False, "recalculated": False}}


def read_xls(filename, library):
    sys.path.insert(0, library)
    import xlrd
    book = xlrd.open_workbook(str(filename), formatting_info=True)
    formulas, safety = biff_formulas(filename.read_bytes(), book.sheet_names())
    sheets = []
    for sheet in book.sheets():
        rows = []
        for row in range(sheet.nrows):
            cells = []
            for column in range(sheet.ncols):
                cell = sheet.cell(row, column)
                if cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
                    continue
                result = {"column": column + 1, "value": cell.value, "type": cell.ctype,
                          "numberFormat": book.format_map[book.xf_list[cell.xf_index].format_key].format_str}
                if cell.ctype == xlrd.XL_CELL_NUMBER:
                    result["numericText"] = repr(cell.value)
                if (sheet.name, row, column) in formulas:
                    result["formula"] = formulas[(sheet.name, row, column)]
                cells.append(result)
            if cells:
                rows.append({"row": row + 1, "hidden": bool(sheet.rowinfo_map.get(row) and sheet.rowinfo_map[row].hidden), "cells": cells})
        sheets.append({"name": sheet.name, "state": "hidden" if sheet.visibility else "visible",
                       "rowCount": sheet.nrows, "columnCount": sheet.ncols, "mergedRanges": sheet.merged_cells, "rows": rows})
    return {"reader": "xlrd " + xlrd.__version__ + " (legacy BIFF fallback)", "sheets": sheets,
            "safety": {**safety, "macrosExecuted": False, "recalculated": False}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--xls-lib", required=True)
    args = parser.parse_args()
    source = pathlib.Path(args.source)
    workbooks = []
    for file in sorted(source.iterdir()):
        if file.suffix.lower() not in (".xls", ".xlsx"):
            continue
        result = read_xlsx(file) if file.suffix.lower() == ".xlsx" else read_xls(file, args.xls_lib)
        content = file.read_bytes()
        workbooks.append({"file": file.name, "sha256": hashlib.sha256(content).hexdigest(),
                          "bytes": len(content), **result})
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"format": "user-price-workbooks-cached-v1", "workbooks": workbooks}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "workbooks": len(workbooks),
                      "sheets": sum(len(w["sheets"]) for w in workbooks),
                      "formulas": sum(w["safety"]["formulaCount"] for w in workbooks), "output": str(output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
