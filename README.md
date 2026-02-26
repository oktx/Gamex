# Attorney Scraper

Find personal injury attorneys in any US city. One command, one CSV file ready for email outreach.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run for a city
python scraper.py --city "Denver"
```

That's it. The CSV file lands in `output/`.

## What It Does

Searches 4 sources automatically:
- **Google** (via Serper API — optional, needs free API key)
- **Avvo** attorney directory
- **Justia** lawyer directory
- **FindLaw** lawyer directory

Extracts: **Name, Firm, Email, Phone, Source, Profile URL**

Deduplicates across sources and exports a single CSV.

## Setup

```bash
pip install -r requirements.txt
```

### Google Search (Optional)

To include Google search results, get a free API key at [serper.dev](https://serper.dev) (2,500 searches/month free):

```bash
cp .env.example .env
# Edit .env and add your key:
# SERPER_API_KEY=your_key_here
```

Without a key, the tool skips Google and uses the 3 directory sources.

## Usage

```bash
# Basic — auto-detects state for major cities
python scraper.py --city "Denver"

# Specify state explicitly
python scraper.py --city "Denver" --state "Colorado"
python scraper.py --city "Denver" --state "CO"

# Custom output file
python scraper.py --city "Denver" --output my_leads.csv

# More pages (default: 3 per directory)
python scraper.py --city "Denver" --max-pages 5

# Skip a source
python scraper.py --city "Denver" --skip google avvo

# Verbose logging
python scraper.py --city "Denver" --verbose
```

## Output

CSV with columns: `name, firm, email, phone, city, state, source, source_url`

Default location: `output/pi_attorneys_denver_co_2026-02-26.csv`

Open it in Excel, Google Sheets, or import directly into your email outreach tool.

## Notes

- Rate-limited (2-4s between requests) to be polite to servers
- Some attorneys won't have email addresses listed publicly — those fields will be blank
- If a source blocks requests, the tool continues with the remaining sources
