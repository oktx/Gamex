import random
import time
import logging
from abc import ABC, abstractmethod

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from config import (
    USER_AGENTS,
    DEFAULT_HEADERS,
    REQUEST_DELAY_RANGE,
    MAX_RETRIES,
    REQUEST_TIMEOUT,
)

logger = logging.getLogger(__name__)


class BaseScraper(ABC):
    """Base class for all attorney directory scrapers."""

    source_name = "unknown"

    def __init__(self, city, state, state_abbrev, max_pages=3):
        self.city = city
        self.state = state
        self.state_abbrev = state_abbrev
        self.max_pages = max_pages
        self._last_request_time = 0

        self.session = requests.Session()
        retry_strategy = Retry(
            total=MAX_RETRIES,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def _throttled_get(self, url, **kwargs):
        """Make a GET request with rate limiting and user-agent rotation."""
        elapsed = time.time() - self._last_request_time
        delay = random.uniform(*REQUEST_DELAY_RANGE)
        if elapsed < delay:
            time.sleep(delay - elapsed)

        headers = {
            **DEFAULT_HEADERS,
            "User-Agent": random.choice(USER_AGENTS),
        }
        headers.update(kwargs.pop("headers", {}))

        self._last_request_time = time.time()
        try:
            response = self.session.get(
                url, headers=headers, timeout=REQUEST_TIMEOUT, **kwargs
            )
            response.raise_for_status()
            return response
        except requests.RequestException as e:
            logger.warning(f"Request failed for {url}: {e}")
            return None

    def _make_record(self, name, firm="", email="", phone="", profile_url=""):
        """Create a standardized attorney record dict."""
        return {
            "name": name.strip() if name else "",
            "firm": firm.strip() if firm else "",
            "email": email.strip().lower() if email else "",
            "phone": phone.strip() if phone else "",
            "city": self.city,
            "state": self.state_abbrev.upper(),
            "source": self.source_name,
            "source_url": profile_url,
        }

    @abstractmethod
    def scrape(self):
        """Run the scraper and return a list of attorney record dicts."""
        pass

    def run(self):
        """Execute the scraper with error handling."""
        logger.info(f"Scraping {self.source_name}...")
        try:
            results = self.scrape()
            logger.info(
                f"  {self.source_name}: found {len(results)} attorneys"
            )
            return results
        except Exception as e:
            logger.error(f"  {self.source_name} failed: {e}")
            return []
