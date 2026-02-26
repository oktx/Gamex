import re
import logging

from bs4 import BeautifulSoup

from config import AVVO_BASE_URL
from scrapers.base import BaseScraper

logger = logging.getLogger(__name__)


class AvvoScraper(BaseScraper):
    """Scrape Avvo attorney directory listings."""

    source_name = "avvo"

    def scrape(self):
        results = []
        city_slug = self.city.lower().replace(" ", "-")
        state_abbrev = self.state_abbrev.lower()

        for page_num in range(1, self.max_pages + 1):
            url = f"{AVVO_BASE_URL}/personal-injury-lawyer/{state_abbrev}/{city_slug}.html"
            if page_num > 1:
                url += f"?page={page_num}"

            logger.info(f"  Fetching Avvo page {page_num}: {url}")

            # Try with cloudscraper if available, fall back to regular requests
            response = self._fetch_with_fallback(url)
            if not response:
                if page_num == 1:
                    logger.warning("  Avvo blocked requests — skipping")
                break

            soup = BeautifulSoup(response.text, "lxml")

            # Extract attorney profile URLs from listing page
            profile_urls = self._extract_profile_urls(soup)
            if not profile_urls:
                logger.info(f"  No more results on Avvo page {page_num}")
                break

            logger.info(f"  Found {len(profile_urls)} attorneys on page {page_num}")

            for profile_url in profile_urls:
                record = self._scrape_profile(profile_url)
                if record:
                    results.append(record)

        return results

    def _fetch_with_fallback(self, url):
        """Try cloudscraper first (handles Cloudflare), fall back to requests."""
        try:
            import cloudscraper
            scraper = cloudscraper.create_scraper()
            response = scraper.get(url, timeout=15)
            response.raise_for_status()
            return response
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"  cloudscraper failed: {e}")

        # Fall back to regular requests
        return self._throttled_get(url)

    def _extract_profile_urls(self, soup):
        """Extract attorney profile URLs from Avvo listing page."""
        urls = []

        # Avvo listing pages contain links to individual attorney profiles
        # Profile URLs follow the pattern: /attorneys/XXXXX-XX-firstname-lastname-XXXXXXX.html
        for link in soup.find_all("a", href=True):
            href = link["href"]
            if "/attorneys/" in href and href.endswith(".html"):
                full_url = href if href.startswith("http") else f"{AVVO_BASE_URL}{href}"
                if full_url not in urls:
                    urls.append(full_url)

        # Also look for lawyer profile links with v2 patterns
        for link in soup.find_all("a", href=True):
            href = link["href"]
            if "/personal-injury-lawyer/" in href and "/review" not in href:
                # Skip if it's a listing page link (not an individual profile)
                if href.count("/") > 3 and href not in urls:
                    full_url = href if href.startswith("http") else f"{AVVO_BASE_URL}{href}"
                    if full_url not in urls:
                        urls.append(full_url)

        return urls

    def _scrape_profile(self, url):
        """Scrape an individual Avvo attorney profile page."""
        response = self._fetch_with_fallback(url)
        if not response:
            return None

        soup = BeautifulSoup(response.text, "lxml")

        name = ""
        firm = ""
        phone = ""
        email = ""

        # Extract name — typically in h1 or prominent heading
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)
            # Clean up "Attorney Name - Lawyer in City, State" patterns
            if " - " in name:
                name = name.split(" - ")[0].strip()

        # Look for name in meta tags
        if not name:
            meta_title = soup.find("meta", property="og:title")
            if meta_title:
                name = meta_title.get("content", "").split("-")[0].strip()

        # Extract phone from tel: links
        for a in soup.find_all("a", href=True):
            if a["href"].startswith("tel:"):
                phone = a["href"].replace("tel:", "").strip()
                break

        # Phone fallback: look for phone patterns near "phone" or "call" text
        if not phone:
            phone_pattern = re.compile(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}")
            for text_block in soup.find_all(string=phone_pattern):
                match = phone_pattern.search(text_block)
                if match:
                    phone = match.group()
                    break

        # Extract firm name
        # Avvo typically shows firm info near the attorney name or in a specific section
        for tag in soup.find_all(["span", "div", "p", "a"]):
            text = tag.get_text(strip=True)
            if any(w in text.lower() for w in ["law firm", "law office", "legal group", "& associates", "law group"]):
                if len(text) < 150 and text != name:
                    firm = text
                    break

        # Try to find email (rarely exposed on Avvo)
        for a in soup.find_all("a", href=True):
            if a["href"].startswith("mailto:"):
                email = a["href"].replace("mailto:", "").split("?")[0].strip()
                break

        if not name:
            return None

        return self._make_record(
            name=name, firm=firm, email=email, phone=phone, profile_url=url
        )
