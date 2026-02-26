import os
from dotenv import load_dotenv

load_dotenv()

# API Keys
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "")
SERPER_API_URL = "https://google.serper.dev/search"

# Request settings
REQUEST_DELAY_RANGE = (1.5, 4.0)
MAX_RETRIES = 3
REQUEST_TIMEOUT = 15

# User-Agent rotation list
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
]

DEFAULT_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

# Directory base URLs
AVVO_BASE_URL = "https://www.avvo.com"
JUSTIA_BASE_URL = "https://www.justia.com"
FINDLAW_BASE_URL = "https://lawyers.findlaw.com"

# State name <-> abbreviation mapping
STATE_ABBREVIATIONS = {
    "alabama": "al", "alaska": "ak", "arizona": "az", "arkansas": "ar",
    "california": "ca", "colorado": "co", "connecticut": "ct", "delaware": "de",
    "florida": "fl", "georgia": "ga", "hawaii": "hi", "idaho": "id",
    "illinois": "il", "indiana": "in", "iowa": "ia", "kansas": "ks",
    "kentucky": "ky", "louisiana": "la", "maine": "me", "maryland": "md",
    "massachusetts": "ma", "michigan": "mi", "minnesota": "mn", "mississippi": "ms",
    "missouri": "mo", "montana": "mt", "nebraska": "ne", "nevada": "nv",
    "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny",
    "north carolina": "nc", "north dakota": "nd", "ohio": "oh", "oklahoma": "ok",
    "oregon": "or", "pennsylvania": "pa", "rhode island": "ri", "south carolina": "sc",
    "south dakota": "sd", "tennessee": "tn", "texas": "tx", "utah": "ut",
    "vermont": "vt", "virginia": "va", "washington": "wa", "west virginia": "wv",
    "wisconsin": "wi", "wyoming": "wy", "district of columbia": "dc",
}

# Reverse mapping: abbreviation -> full name
ABBREVIATION_TO_STATE = {v: k for k, v in STATE_ABBREVIATIONS.items()}

# Common cities to states (for auto-detection when --state is omitted)
CITY_STATE_MAP = {
    "denver": "colorado", "phoenix": "arizona", "houston": "texas",
    "dallas": "texas", "austin": "texas", "san antonio": "texas",
    "los angeles": "california", "san francisco": "california", "san diego": "california",
    "new york": "new york", "chicago": "illinois", "miami": "florida",
    "tampa": "florida", "orlando": "florida", "jacksonville": "florida",
    "atlanta": "georgia", "seattle": "washington", "portland": "oregon",
    "las vegas": "nevada", "boston": "massachusetts", "philadelphia": "pennsylvania",
    "pittsburgh": "pennsylvania", "detroit": "michigan", "minneapolis": "minnesota",
    "charlotte": "north carolina", "raleigh": "north carolina",
    "nashville": "tennessee", "memphis": "tennessee", "st. louis": "missouri",
    "kansas city": "missouri", "new orleans": "louisiana", "salt lake city": "utah",
    "indianapolis": "indiana", "columbus": "ohio", "cleveland": "ohio",
    "cincinnati": "ohio", "milwaukee": "wisconsin", "sacramento": "california",
    "san jose": "california", "oakland": "california",
    "baltimore": "maryland", "richmond": "virginia",
    "albuquerque": "new mexico", "tucson": "arizona",
    "oklahoma city": "oklahoma", "tulsa": "oklahoma",
    "louisville": "kentucky", "birmingham": "alabama",
    "charleston": "south carolina", "boise": "idaho",
    "des moines": "iowa", "omaha": "nebraska",
    "honolulu": "hawaii", "anchorage": "alaska",
}


def resolve_state(city, state=None):
    """Resolve state from city name or validate provided state."""
    if state:
        state_lower = state.lower().strip()
        # If it's an abbreviation, convert to full name
        if state_lower in ABBREVIATION_TO_STATE:
            return ABBREVIATION_TO_STATE[state_lower]
        if state_lower in STATE_ABBREVIATIONS:
            return state_lower
        return None

    city_lower = city.lower().strip()
    return CITY_STATE_MAP.get(city_lower)


def get_state_abbrev(state_full):
    """Get 2-letter abbreviation from full state name."""
    return STATE_ABBREVIATIONS.get(state_full.lower().strip(), "")
