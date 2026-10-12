import argparse
import csv
import json
import re
import shutil
import subprocess
from io import BytesIO, StringIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IMAGE = ROOT / "data" / "Screenshot_20261012_164157.jpg"
DEFAULT_OUTPUT = ROOT / "data" / "crop-test" / "Screenshot_20261012_164157.json"
DEFAULT_CROPS = ROOT / "data" / "crop-test" / "crops"
MIN_BOUNDARY_CONTRAST = 1.8
MAX_FLAT_ROW_DEVIATION = 1.0
HEADER_MAX_HEIGHT = 220
MIN_SEGMENT_HEIGHT = 120


def display_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(resolved)


def detect_boundaries(image: Image.Image) -> list[int]:
    grayscale = np.asarray(ImageOps.grayscale(image), dtype=np.float32)
    row_means = grayscale.mean(axis=1)
    row_deviations = grayscale.std(axis=1)
    candidates = []

    for y in range(2, image.height - 2):
        contrast = row_means[y] - (row_means[y - 2 : y].mean() + row_means[y + 1 : y + 3].mean()) / 2
        if row_deviations[y] <= MAX_FLAT_ROW_DEVIATION and contrast >= MIN_BOUNDARY_CONTRAST:
            candidates.append((float(contrast), y))

    grouped = []
    for contrast, y in candidates:
        if grouped and y - grouped[-1][-1][1] <= 2:
            grouped[-1].append((contrast, y))
        else:
            grouped.append([(contrast, y)])

    boundaries = [
        max(group, key=lambda item: item[0])[1]
        for group in grouped
        if group[0][1] >= 24 and group[-1][1] < image.height - 24
    ]
    return boundaries


def recognize_text(image: Image.Image, page_segmentation_mode: int) -> str | None:
    executable = shutil.which("tesseract")
    if not executable:
        return None

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    result = subprocess.run(
        [executable, "stdin", "stdout", "-l", "chi_sim+eng", "--psm", str(page_segmentation_mode)],
        input=buffer.getvalue(),
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        timeout=20,
        check=False,
    )
    return result.stdout.decode("utf-8", errors="replace").strip() or None


def recognize_month(image: Image.Image, start: int, end: int) -> tuple[str | None, str | None]:
    header = image.crop((24, start + 12, min(image.width, 650), end - 8))
    header = header.resize((header.width * 3, header.height * 3))
    text = recognize_text(header, 7)
    if not text:
        return None, None
    match = re.search(r"(20\d{2})\s*年\s*(\d{1,2})\s*月", text)
    month = f"{match.group(1)}-{int(match.group(2)):02d}" if match else None
    return month, text


def recognize_description(image: Image.Image) -> str | None:
    executable = shutil.which("tesseract")
    if not executable:
        return None

    grayscale = ImageOps.autocontrast(ImageOps.grayscale(image))
    variants = [
        grayscale,
        grayscale.point(lambda value: 255 if value > 200 else 0),
    ]
    candidates = []

    for variant in variants:
        variant = variant.resize((variant.width * 2, variant.height * 2))
        buffer = BytesIO()
        variant.save(buffer, format="PNG")
        result = subprocess.run(
            [executable, "stdin", "stdout", "-l", "chi_sim", "--psm", "7", "tsv"],
            input=buffer.getvalue(),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=20,
            check=False,
        )
        rows = csv.DictReader(StringIO(result.stdout.decode("utf-8", errors="replace")), delimiter="\t")
        words = [row for row in rows if row["level"] == "5" and row["text"].strip()]
        confidences = [float(row["conf"]) for row in words if float(row["conf"]) >= 0]
        if words and confidences:
            candidates.append((sum(confidences) / len(confidences), " ".join(row["text"] for row in words)))

    return max(candidates, key=lambda candidate: candidate[0])[1] if candidates else None


def parse_transaction_data(
    text: str | None,
    month: str | None,
    description_text: str | None,
) -> dict[str, str | None]:
    lines = [re.sub(r"\s+", "", line) for line in (text or "").splitlines() if line.strip()]
    amount_pattern = re.compile(r"[+-]?\d+\.\d{2}")
    amount_line = next((line for line in lines if amount_pattern.search(line)), "")
    amount_match = amount_pattern.search(amount_line)
    amount = amount_match.group(0) if amount_match else None
    full_description = None
    if amount_match:
        full_description = (amount_line[: amount_match.start()] + amount_line[amount_match.end() :]).strip(" +-:") or None
    localized_description = re.sub(r"\s+", "", description_text or "").strip() or None
    description = full_description or localized_description
    if localized_description:
        full_characters = re.findall(r"[\u3400-\u9fffA-Za-z0-9]", full_description or "")
        localized_characters = re.findall(r"[\u3400-\u9fffA-Za-z0-9]", localized_description)
        full_chinese_ratio = sum("\u3400" <= character <= "\u9fff" for character in full_characters) / max(len(full_characters), 1)
        localized_chinese_ratio = sum("\u3400" <= character <= "\u9fff" for character in localized_characters) / max(len(localized_characters), 1)
        if full_description and full_description.endswith(localized_description):
            description = localized_description
        elif localized_chinese_ratio > full_chinese_ratio + 0.25:
            description = localized_description

    normalized_text = "".join(lines)
    date_match = re.search(r"(\d{1,2})[月A](\d{1,2})[日H](\d{1,2}:\d{2})", normalized_text)
    year_month = re.fullmatch(r"(20\d{2})-(\d{2})", month or "")
    date_time = None
    if date_match and year_month:
        year, month_number = year_month.groups()
        day, time = date_match.groups()[1:]
        date_time = f"{year}-{month_number}-{int(day):02d}T{time}"

    balance_match = re.search(r"余额([+-]?\d+\.\d{2})", normalized_text)
    return {
        "description": description,
        "dateTime": date_time,
        "amount": amount,
        "balance": balance_match.group(1) if balance_match else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Crop month headers and transaction rows from a tall screenshot.")
    parser.add_argument("--input", type=Path, default=DEFAULT_IMAGE, help="Source screenshot")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="JSON output path")
    parser.add_argument("--crops-dir", type=Path, default=DEFAULT_CROPS, help="Directory for cropped images")
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGB")
    detected = detect_boundaries(image)
    boundaries = [0, *detected, image.height]
    segments = [
        (start, end)
        for start, end in zip(boundaries, boundaries[1:])
        if end - start >= MIN_SEGMENT_HEIGHT
    ]

    args.crops_dir.mkdir(parents=True, exist_ok=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    entries = []
    current_month = None

    for index, (start, end) in enumerate(segments, start=1):
        segment_type = "month_header" if end - start <= HEADER_MAX_HEIGHT else "transaction"
        month = None
        ocr_text = None
        description_text = None
        if segment_type == "month_header":
            month, ocr_text = recognize_month(image, start, end)
            if month:
                current_month = month

        crop_start = start + (1 if start in detected else 0)
        crop_end = end - (1 if end in detected else 0)
        crop = image.crop((0, crop_start, image.width, crop_end))
        month_suffix = f"-{current_month}" if current_month else ""
        filename = f"{index:03d}-{segment_type}{month_suffix}.jpg"
        crop_path = args.crops_dir / filename
        crop.save(crop_path, quality=95)
        if segment_type == "transaction":
            with Image.open(crop_path) as saved_crop:
                saved_crop = saved_crop.convert("RGB")
            ocr_text = recognize_text(saved_crop, 6)
            description_crop = saved_crop.crop((235, 25, min(saved_crop.width, 1000), min(saved_crop.height, 130)))
            description_text = recognize_description(description_crop)

        entry = {
            "type": segment_type,
            "month": month if segment_type == "month_header" else current_month,
            "bbox": {"left": 0, "top": crop_start, "right": image.width, "bottom": crop_end},
            "crop": display_path(crop_path),
            "ocrText": ocr_text,
            "data": {"month": month}
            if segment_type == "month_header"
            else parse_transaction_data(ocr_text, current_month, description_text),
        }
        entries.append(entry)

    output = {
        "source": display_path(args.input),
        "image": {"width": image.width, "height": image.height},
        "coordinateConvention": "bbox uses left/top inclusive and right/bottom exclusive",
        "detectedHorizontalBoundaries": detected,
        "segments": entries,
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} segments to {args.output}")
    print(f"Cropped images: {args.crops_dir}")


if __name__ == "__main__":
    main()