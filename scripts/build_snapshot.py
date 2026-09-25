"""Convert the supplied July 2026 workbook into the app's typed source payload.

Run: python scripts/build_snapshot.py [path-to-xlsx]
The workbook stays outside public assets. The JSON is local prototype data only.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "DATA KARYAWAN DUMMY.xlsx"
OUTPUT = ROOT / "src" / "data" / "snapshot-2026-07.json"
FIELDS = {
    "NIP": "nip", "NAMA": "name", "BAND": "band", "JENIS JABATAN": "positionType",
    "JABATAN": "position", "DIREKTORAT": "directorate", "DIVISI": "division",
    "BAGIAN": "section", "AGAMA": "religion", "ACTIVITY": "activity",
    "FUNGSI BISNIS": "businessFunction", "TANGGAL LAHIR": "birthDate",
    "USIA": "sourceAge", "USIA 1": "sourceAgeGroup", "MASKER": "sourceTenure",
    "MASKER 1": "sourceTenureGroup", "STATUS": "status", "INSTITUTE": "institution",
    "JURUSAN": "major", "POSITION": "positionCode", "JENIS KELAMIN": "genderCode",
    "JENIS KELAMIN 1": "genderLabel", "PENDIDIKAN": "educationCode",
    "TANGGAL MASUK": "joinDate", "TOTAL": "sourceTotal",
}


def iso_date(value: object) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    return datetime.strptime(str(value), "%d.%m.%Y").date().isoformat()


def synthetic_date(value: str | None, as_of: datetime) -> str | None:
    if not value:
        return None
    date = datetime.fromisoformat(value)
    years = as_of.year - date.year - ((as_of.month, as_of.day) < (date.month, date.day))
    return f"{as_of.year - years:04d}-01-01"


def build() -> None:
    book = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    sheet = book.active
    cells = sheet.values
    headers = next(cells)
    if any(key not in headers for key in FIELDS):
        raise ValueError("Required source columns are missing")
    records = []
    as_of = datetime(2026, 7, 31)
    for values in cells:
        raw = dict(zip(headers, values))
        if raw.get("NIP") in (None, ""):
            continue
        item = {target: raw.get(source) for source, target in FIELDS.items()}
        item["birthDate"] = synthetic_date(iso_date(item["birthDate"]), as_of)
        item["joinDate"] = synthetic_date(iso_date(item["joinDate"]), as_of)
        item["nip"] = f"DUMMY{len(records) + 1:04d}"
        item["name"] = f"Pegawai Dummy {len(records) + 1:03d}"
        records.append(item)
    if len({r["nip"] for r in records}) != len(records):
        raise ValueError("Duplicate NIP in source workbook")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"period": "2026-07", "asOf": "2026-07-31", "sourceFile": "DATA KARYAWAN DUMMY.xlsx", "records": records}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(records)} records to {OUTPUT}")


if __name__ == "__main__":
    build()
