#!/usr/bin/env python3
"""
Attorney Scraper — Find personal injury attorneys in any US city.

Usage:
    python scraper.py --city "Denver"
    python scraper.py --city "Denver" --state "Colorado"
    python scraper.py --city "Houston" --output leads.csv
    python scraper.py --city "Phoenix" --state "AZ" --skip google
"""

import argparse
import logging
import sys

from config import resolve_state, get_state_abbrev
from scrapers.google import GoogleScraper
from scrapers.avvo import AvvoScraper
from scrapers.justia import JustiaScraper
from scrapers.findlaw import FindLawScraper
from utils import deduplicate, export_csv


def setup_logging(verbose=False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="[%(levelname)s] %(message)s",
        stream=sys.stderr,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Scrape personal injury attorney contact info for email outreach."
    )
    parser.add_argument(
        "--city", required=True,
        help='City to search, e.g. "Denver"',
    )
    parser.add_argument(
        "--state", default=None,
        help='State name or abbreviation, e.g. "Colorado" or "CO". Auto-detected for major cities.',
    )
    parser.add_argument(
        "--output", default=None,
        help="Output CSV file path. Default: output/pi_attorneys_<city>_<state>_<date>.csv",
    )
    parser.add_argument(
        "--max-pages", type=int, default=3,
        help="Max listing pages to scrape per directory (default: 3)",
    )
    parser.add_argument(
        "--skip", nargs="*", default=[],
        help="Sources to skip: google, avvo, justia, findlaw",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Enable verbose/debug logging",
    )
    args = parser.parse_args()

    setup_logging(args.verbose)
    logger = logging.getLogger(__name__)

    # Resolve state
    state_full = resolve_state(args.city, args.state)
    if not state_full:
        if args.state:
            logger.error(
                f'Could not resolve state "{args.state}". '
                f"Use a full state name (e.g., Colorado) or abbreviation (e.g., CO)."
            )
        else:
            logger.error(
                f'Could not auto-detect state for "{args.city}". '
                f"Please provide --state explicitly."
            )
        sys.exit(1)

    state_abbrev = get_state_abbrev(state_full)
    skip_sources = [s.lower().strip() for s in (args.skip or [])]

    logger.info(f"Searching for personal injury attorneys in {args.city}, {state_abbrev.upper()}")

    # Configure and run scrapers
    scraper_classes = [
        ("google", GoogleScraper),
        ("avvo", AvvoScraper),
        ("justia", JustiaScraper),
        ("findlaw", FindLawScraper),
    ]

    all_results = []
    for name, scraper_cls in scraper_classes:
        if name in skip_sources:
            logger.info(f"Skipping {name} (--skip)")
            continue

        scraper = scraper_cls(
            city=args.city,
            state=state_full,
            state_abbrev=state_abbrev,
            max_pages=args.max_pages,
        )
        results = scraper.run()
        all_results.extend(results)

    logger.info(f"Collected {len(all_results)} raw records across all sources")

    # Deduplicate
    unique_results = deduplicate(all_results)
    logger.info(f"After deduplication: {len(unique_results)} unique attorneys")

    if not unique_results:
        logger.warning("No attorneys found. Try a different city or check your internet connection.")
        sys.exit(0)

    # Export CSV
    filepath = export_csv(
        unique_results,
        filepath=args.output,
        city=args.city,
        state=state_abbrev,
    )

    print(f"\nDone! {len(unique_results)} attorneys saved to: {filepath}")


if __name__ == "__main__":
    main()
