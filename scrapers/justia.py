import json
import re
import logging

from bs4 import BeautifulSoup

from config import JUSTIA_BASE_URL
from scrapers.base import BaseScraper

logger = logging.getLogger(__name__)


class JustiaScraper(BaseScraper):
    """Scrape Justia lawyer directory listings."""

    source_name = "justia"

    def scrape(self):
        results = []
        city_slug = self.city.lower().replace(" ", "-")
        state_slug = self.state.lower().replace(" ", "-")

        for page_num in range(1, self.max_pages + 1):
            if page_num == 1:
                url = f"{JUSTIA_BASE_URL}/lawyers/personal-injury/{state_slug}/{city_slug}"
            else:
                url = f"{JUSTIA_BASE_URL}/lawyers/personal-injury/{state_slug}/{city_slug}/page-{page_num}"

            logger.info(f"  Fetching Justia page {page_num}: {url}")
            response = self._throttled_get(url)
            if not response:
                if page_num == 1:
                    logger.warning("  Justia returned no response — skipping")
                break

            soup = BeautifulSoup(response.text, "lxml")

            # Extract from listing page directly (many details are on the listing)
            page_results = self._extract_from_listing(soup)

            if not page_results:
                # Try extracting profile URLs and scraping individually
                profile_urls = self._extract_profile_urls(soup)
                if not profile_urls:
                    logger.info(f"  No more results on Justia page {page_num}")
                    break

                logger.info(f"  Found {len(profile_urls)} attorneys on page {page_num}")
                for profile_url in profile_urls:
                    record = self._scrape_profile(profile_url)
                    if record:
                        results.append(record)
            else:
                logger.info(f"  Extracted {len(page_results)} attorneys from listing page {page_num}")
                results.extend(page_results)

        return results

    def _extract_from_listing(self, soup):
        """Extract attorney info directly from the listing page cards."""
        results = []

        # Justia uses lawyer-card or similar card-based layouts
        cards = soup.find_all("div", class_=re.compile(r"lawyer|attorney|listing|profile", re.I))
        if not cards:
            # Broader search for card-like containers
            cards = soup.find_all("div", class_=re.compile(r"card|result", re.I))

        for card in cards:
            name = ""
            firm = ""
            phone = ""
            email = ""
            profile_url = ""

            # Find name (usually in a heading or strong link)
            name_link = card.find("a", class_=re.compile(r"name|lawyer", re.I))
            if not name_link:
                name_link = card.find("a")
            if name_link:
                name = name_link.get_text(strip=True)
                href = name_link.get("href", "")
                if href:
                    profile_url = href if href.startswith("http") else f"{JUSTIA_BASE_URL}{href}"

            # Find phone
            phone_el = card.find(string=re.compile(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}"))
            if phone_el:
                match = re.search(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}", phone_el)
                if match:
                    phone = match.group()

            # Check for tel: links
            for a in card.find_all("a", href=True):
                if a["href"].startswith("tel:"):
                    phone = a["href"].replace("tel:", "").strip()
                    break

            # Find email
            for a in card.find_all("a", href=True):
                if a["href"].startswith("mailto:"):
                    email = a["href"].replace("mailto:", "").split("?")[0].strip()
                    break

            if name and len(name) < 100:
                results.append(self._make_record(
                    name=name, firm=firm, email=email, phone=phone,
                    profile_url=profile_url,
                ))

        return results

    def _extract_profile_urls(self, soup):
        """Extract individual attorney profile URLs from listing page."""
        urls = []

        for link in soup.find_all("a", href=True):
            href = link["href"]
            # Justia lawyer profiles typically contain /lawyer/ or /lawyers/ patterns
            if "/lawyer/" in href and href not in urls:
                full_url = href if href.startswith("http") else f"{JUSTIA_BASE_URL}{href}"
                if full_url not in urls:
                    urls.append(full_url)

        return urls

    def _scrape_profile(self, url):
        """Scrape an individual Justia attorney profile page."""
        response = self._throttled_get(url)
        if not response:
            return None

        soup = BeautifulSoup(response.text, "lxml")

        name = ""
        firm = ""
        phone = ""
        email = ""

        # Try JSON-LD first
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                if isinstance(data, list):
                    data = data[0]
                schema_type = data.get("@type", "")
                if schema_type in ("Attorney", "LegalService", "Person", "ProfessionalService"):
                    name = data.get("name", "")
                    phone = data.get("telephone", "")
                    email = data.get("email", "")
                    if isinstance(data.get("memberOf"), dict):
                        firm = data["memberOf"].get("name", "")
                    elif isinstance(data.get("worksFor"), dict):
                        firm = data["worksFor"].get("name", "")
                    break
            except (json.JSONDecodeError, AttributeError):
                continue

        # HTML fallbacks
        if not name:
            h1 = soup.find("h1")
            if h1:
                name = h1.get_text(strip=True)
                if " - " in name:
                    name = name.split(" - ")[0].strip()

        if not phone:
            for a in soup.find_all("a", href=True):
                if a["href"].startswith("tel:"):
                    phone = a["href"].replace("tel:", "").strip()
                    break

        if not phone:
            phone_pattern = re.compile(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}")
            for text_block in soup.find_all(string=phone_pattern):
                match = phone_pattern.search(text_block)
                if match:
                    phone = match.group()
                    break

        if not email:
            for a in soup.find_all("a", href=True):
                if a["href"].startswith("mailto:"):
                    email = a["href"].replace("mailto:", "").split("?")[0].strip()
                    break

        if not name:
            return None

        return self._make_record(
            name=name, firm=firm, email=email, phone=phone, profile_url=url
        )
