import json
import re
import logging

import requests
from bs4 import BeautifulSoup

from config import SERPER_API_KEY, SERPER_API_URL
from scrapers.base import BaseScraper

logger = logging.getLogger(__name__)


class GoogleScraper(BaseScraper):
    """Scrape Google search results via Serper API for attorney info."""

    source_name = "google"

    def scrape(self):
        if not SERPER_API_KEY:
            logger.info("  No SERPER_API_KEY set — skipping Google search")
            return []

        results = []
        queries = [
            f"personal injury attorney {self.city} {self.state}",
            f"personal injury lawyer {self.city} {self.state}",
        ]

        for query in queries:
            search_results = self._search_serper(query)
            for item in search_results:
                url = item.get("link", "")
                title = item.get("title", "")
                snippet = item.get("snippet", "")

                # Skip non-attorney sites
                if any(
                    skip in url.lower()
                    for skip in [
                        "wikipedia", "yelp.com/biz", "youtube.com",
                        "news", "reddit.com", "facebook.com",
                    ]
                ):
                    continue

                record = self._scrape_website(url, title, snippet)
                if record:
                    results.append(record)

        return results

    def _search_serper(self, query):
        """Call Serper API and return organic results."""
        try:
            response = requests.post(
                SERPER_API_URL,
                headers={
                    "X-API-KEY": SERPER_API_KEY,
                    "Content-Type": "application/json",
                },
                json={"q": query, "num": 20},
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()

            results = []

            # Local pack results (Google Maps)
            for item in data.get("places", []):
                record = self._make_record(
                    name=item.get("title", ""),
                    phone=item.get("phone", ""),
                    profile_url=item.get("link", ""),
                )
                if record["name"]:
                    results.append(record)

            # Return organic results for further scraping
            return data.get("organic", [])

        except requests.RequestException as e:
            logger.warning(f"  Serper API call failed: {e}")
            return []

    def _scrape_website(self, url, title, snippet):
        """Visit an attorney/firm website and extract contact info."""
        response = self._throttled_get(url)
        if not response:
            return None

        soup = BeautifulSoup(response.text, "lxml")

        # Try JSON-LD structured data first
        record = self._extract_jsonld(soup, url)
        if record and record.get("name"):
            return record

        # Fall back to HTML heuristics
        name = self._extract_name(soup, title)
        if not name:
            return None

        email = self._find_email(soup, response.text)
        phone = self._find_phone(soup, response.text)
        firm = self._extract_firm(soup, name)

        return self._make_record(
            name=name, firm=firm, email=email, phone=phone, profile_url=url
        )

    def _extract_jsonld(self, soup, url):
        """Extract attorney info from JSON-LD structured data."""
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                if isinstance(data, list):
                    data = data[0]

                schema_type = data.get("@type", "")
                if schema_type in ("Attorney", "LegalService", "ProfessionalService", "LocalBusiness"):
                    return self._make_record(
                        name=data.get("name", ""),
                        firm=data.get("memberOf", {}).get("name", "") if isinstance(data.get("memberOf"), dict) else "",
                        email=data.get("email", ""),
                        phone=data.get("telephone", ""),
                        profile_url=url,
                    )
            except (json.JSONDecodeError, AttributeError):
                continue
        return None

    def _extract_name(self, soup, fallback_title):
        """Try to extract attorney/firm name from page."""
        h1 = soup.find("h1")
        if h1:
            text = h1.get_text(strip=True)
            if text and len(text) < 100:
                return text
        # Fall back to title tag or search result title
        title_tag = soup.find("title")
        if title_tag:
            text = title_tag.get_text(strip=True).split("|")[0].split("-")[0].strip()
            if text and len(text) < 100:
                return text
        return fallback_title.split("|")[0].split("-")[0].strip() if fallback_title else ""

    def _extract_firm(self, soup, name):
        """Try to extract firm name if different from attorney name."""
        title_tag = soup.find("title")
        if title_tag:
            parts = re.split(r"[|\-–]", title_tag.get_text())
            for part in parts:
                part = part.strip()
                if part and part != name and len(part) < 100:
                    if any(w in part.lower() for w in ["law", "legal", "attorney", "firm", "group", "associates"]):
                        return part
        return ""

    def _find_email(self, soup, text):
        """Find email addresses in page content."""
        # Check mailto links
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("mailto:"):
                email = href.replace("mailto:", "").split("?")[0].strip()
                if "@" in email and not email.endswith((".gov", ".edu")):
                    return email

        # Regex fallback in page text
        emails = re.findall(
            r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
            text,
        )
        for email in emails:
            if not email.endswith((".gov", ".edu", ".png", ".jpg", ".gif")):
                return email
        return ""

    def _find_phone(self, soup, text):
        """Find phone numbers in page content."""
        # Check tel: links
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("tel:"):
                phone = href.replace("tel:", "").strip()
                digits = re.sub(r"\D", "", phone)
                if len(digits) >= 10:
                    return phone

        # Regex fallback
        patterns = [
            r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}",
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group()
        return ""
