import csv
import os
import re
import logging
from datetime import date

logger = logging.getLogger(__name__)


# --- Normalization ---

def normalize_name(name):
    """Lowercase, strip titles/suffixes, collapse whitespace."""
    if not name:
        return ""
    name = name.lower().strip()
    for suffix in [
        "esq.", "esq", "j.d.", "j.d", "llc", "pllc", "p.c.", "p.a.",
        "iii", "ii", "iv", "jr.", "jr", "sr.", "sr", ",",
    ]:
        name = name.replace(suffix, "")
    name = re.sub(r"\s+", " ", name).strip()
    return name


def normalize_phone(phone):
    """Strip to digits only. Return 10-digit US number or empty string."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits if len(digits) == 10 else ""


def format_phone(phone):
    """Format a 10-digit phone string as (XXX) XXX-XXXX."""
    digits = normalize_phone(phone)
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    return phone.strip() if phone else ""


# --- Deduplication ---

def deduplicate(records):
    """Merge duplicate attorney records across sources."""
    seen = {}

    for record in records:
        if not record.get("name"):
            continue

        norm_name = normalize_name(record["name"])
        norm_phone = normalize_phone(record.get("phone", ""))

        # Composite key: name + phone helps disambiguate common names
        if norm_phone:
            key = f"{norm_name}|{norm_phone}"
        else:
            key = norm_name

        if not key:
            continue

        if key in seen:
            existing = seen[key]
            # Fill in blanks from the new record
            for field in ["email", "phone", "firm", "source_url"]:
                if not existing.get(field) and record.get(field):
                    existing[field] = record[field]
            # Merge sources
            sources = set(existing.get("source", "").split(","))
            sources.add(record.get("source", ""))
            existing["source"] = ",".join(sorted(s for s in sources if s))
        else:
            seen[key] = record.copy()

    return list(seen.values())


# --- CSV Export ---

CSV_COLUMNS = ["name", "firm", "email", "phone", "city", "state", "source", "source_url"]


def export_csv(records, filepath=None, city="attorneys", state=""):
    """Write attorney records to a CSV file."""
    if not filepath:
        os.makedirs("output", exist_ok=True)
        city_slug = city.lower().replace(" ", "_")
        state_slug = state.lower().replace(" ", "_") if state else ""
        today = date.today().isoformat()
        filename = f"pi_attorneys_{city_slug}_{state_slug}_{today}.csv"
        filepath = os.path.join("output", filename)

    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)

    # Format phone numbers for display
    for record in records:
        record["phone"] = format_phone(record.get("phone", ""))

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for record in sorted(records, key=lambda r: r.get("name", "")):
            writer.writerow(record)

    logger.info(f"Results written to {filepath}")
    return filepath
