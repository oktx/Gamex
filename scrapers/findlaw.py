import json
import re
import logging

from bs4 import BeautifulSoup

from config import FINDLAW_BASE_URL
from scrapers.base import BaseScraper

logger = logging.getLogger(__name__)


class FindLawScraper(BaseScraper):
    """Scrape FindLaw lawyer directory listings."""

    source_name = "findlaw"

    def scrape(self):
        results = []
        city_slug = self.city.lower().replace(" ", "-")
        state_slug = self.state.lower().replace(" ", "-")

        for page_num in range(1, self.max_pages + 1):
            url = f"{FINDLAW_BASE_URL}/lawyer/firm/personal-injury-plaintiff/{city_slug}/{state_slug}"
            if page_num > 1:
                url += f"?page={page_num}"

            logger.info(f"  Fetching FindLaw page {page_num}: {url}")
            response = self._throttled_get(url)
            if not response:
                if page_num == 1:
                    logger.warning("  FindLaw returned no response — skipping")
                break

            soup = BeautifulSoup(response.text, "lxml")

            # Try to extract from listing page JSON-LD
            page_results = self._extract_from_jsonld(soup)

            if not page_results:
                # Fall back to HTML parsing of listing cards
                page_results = self._extract_from_listing(soup)

            if not page_results:
                # Try extracting profile URLs and scraping individually
                profile_urls = self._extract_profile_urls(soup)
                if not profile_urls:
                    logger.info(f"  No more results on FindLaw page {page_num}")
                    break

                logger.info(f"  Found {len(profile_urls)} profile URLs on page {page_num}")
                for profile_url in profile_urls:
                    record = self._scrape_profile(profile_url)
                    if record:
                        page_results.append(record)

            if page_results:
                logger.info(f"  Extracted {len(page_results)} attorneys from page {page_num}")
                results.extend(page_results)
            else:
                break

        return results

    def _extract_from_jsonld(self, soup):
        """Extract attorney info from JSON-LD structured data on listing pages."""
        results = []

        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                items = data if isinstance(data, list) else [data]

                for item in items:
                    schema_type = item.get("@type", "")
                    if schema_type in ("Attorney", "LegalService", "ProfessionalService", "LocalBusiness"):
                        firm = ""
                        if isinstance(item.get("memberOf"), dict):
                            firm = item["memberOf"].get("name", "")

                        record = self._make_record(
                            name=item.get("name", ""),
                            firm=firm,
                            email=item.get("email", ""),
                            phone=item.get("telephone", ""),
                            profile_url=item.get("url", ""),
                        )
                        if record["name"]:
                            results.append(record)

                    # Handle ItemList containing attorneys
                    if schema_type == "ItemList":
                        for list_item in item.get("itemListElement", []):
                            inner = list_item.get("item", list_item)
                            firm = ""
                            if isinstance(inner.get("memberOf"), dict):
                                firm = inner["memberOf"].get("name", "")

                            record = self._make_record(
                                name=inner.get("name", ""),
                                firm=firm,
                                email=inner.get("email", ""),
                                phone=inner.get("telephone", ""),
                                profile_url=inner.get("url", ""),
                            )
                            if record["name"]:
                                results.append(record)

            except (json.JSONDecodeError, AttributeError):
                continue

        return results

    def _extract_from_listing(self, soup):
        """Extract attorney info from HTML listing cards."""
        results = []

        # FindLaw uses various card layouts
        cards = soup.find_all("div", class_=re.compile(r"lawyer|attorney|listing|profile|result|card", re.I))

        for card in cards:
            name = ""
            firm = ""
            phone = ""
            email = ""
            profile_url = ""

            # Find name link
            name_link = card.find("a", class_=re.compile(r"name|lawyer|attorney", re.I))
            if not name_link:
                # Try heading inside card
                heading = card.find(["h2", "h3", "h4"])
                if heading:
                    name_link = heading.find("a") or heading

            if name_link:
                name = name_link.get_text(strip=True)
                if hasattr(name_link, "get"):
                    href = name_link.get("href", "")
                    if href:
                        profile_url = href if href.startswith("http") else f"{FINDLAW_BASE_URL}{href}"

            # Find phone
            for a in card.find_all("a", href=True):
                if a["href"].startswith("tel:"):
                    phone = a["href"].replace("tel:", "").strip()
                    break

            if not phone:
                phone_match = card.find(string=re.compile(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}"))
                if phone_match:
                    match = re.search(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}", phone_match)
                    if match:
                        phone = match.group()

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
            # FindLaw profile links typically contain /profile/ or specific patterns
            if any(p in href for p in ["/profile/", "/lawyer/", "/attorney/"]):
                full_url = href if href.startswith("http") else f"{FINDLAW_BASE_URL}{href}"
                if full_url not in urls and "/firm/" not in full_url:
                    urls.append(full_url)

        return urls

    def _scrape_profile(self, url):
        """Scrape an individual FindLaw attorney profile page."""
        response = self._throttled_get(url)
        if not response:
            return None

        soup = BeautifulSoup(response.text, "lxml")

        # Try JSON-LD first
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                if isinstance(data, list):
                    data = data[0]
                schema_type = data.get("@type", "")
                if schema_type in ("Attorney", "LegalService", "Person", "ProfessionalService"):
                    firm = ""
                    if isinstance(data.get("memberOf"), dict):
                        firm = data["memberOf"].get("name", "")

                    return self._make_record(
                        name=data.get("name", ""),
                        firm=firm,
                        email=data.get("email", ""),
                        phone=data.get("telephone", ""),
                        profile_url=url,
                    )
            except (json.JSONDecodeError, AttributeError):
                continue

        # HTML fallback
        name = ""
        firm = ""
        phone = ""
        email = ""

        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)
            if " - " in name:
                name = name.split(" - ")[0].strip()

        if not name:
            meta_title = soup.find("meta", property="og:title")
            if meta_title:
                name = meta_title.get("content", "").split("-")[0].strip()

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

        for a in soup.find_all("a", href=True):
            if a["href"].startswith("mailto:"):
                email = a["href"].replace("mailto:", "").split("?")[0].strip()
                break

        if not name:
            return None

        return self._make_record(
            name=name, firm=firm, email=email, phone=phone, profile_url=url
        )
