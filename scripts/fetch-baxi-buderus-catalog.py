from __future__ import annotations

import concurrent.futures
import gzip
import html as html_module
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "tmp" / "baxi-buderus-source"
OUT_FILE = OUT_DIR / "products.json"
USER_AGENT = "Mozilla/5.0 TD-Sofiivka-Catalog/1.0"
VERIFIED_ON = "2026-09-21"
BAXI_ROOT = "https://baxi.ua/"
BAXI_SITEMAP = "https://baxi.ua/sitemap.xml"
BAXI_ECATALOG = "https://baxi.ua/page/e-katalog/"
BUDERUS_SITEMAP = "https://www.buderus.com/sitemaps/ua/uk/page.xml"


def clean(value: object = "") -> str:
    text = html_module.unescape(str(value or ""))
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    return text.strip()


def unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw in values:
        value = clean(raw)
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def iri_to_uri(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(urllib.parse.unquote(parts.path), safe="/%()+'!$&*,;=:@")
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))


def fetch_bytes(url: str, attempts: int = 4) -> tuple[bytes, str, str]:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(
                iri_to_uri(url),
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Encoding": "identity",
                },
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read()
                if data.startswith(b"\x1f\x8b"):
                    data = gzip.decompress(data)
                return data, response.geturl(), response.headers.get_content_charset() or "utf-8"
        except Exception as error:
            last_error = error
            if attempt < attempts:
                time.sleep(attempt * 1.5)
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def fetch_text(url: str, attempts: int = 4) -> tuple[str, str]:
    data, final_url, charset = fetch_bytes(url, attempts)
    try:
        return data.decode(charset), final_url
    except (LookupError, UnicodeDecodeError):
        return data.decode("utf-8", errors="replace"), final_url


def document_tree(source: str):
    return html.fromstring(source)


def text_content(element) -> str:
    return clean(element.text_content()) if element is not None else ""


def xpath_texts(root, expression: str) -> list[str]:
    return unique([text_content(element) if hasattr(element, "text_content") else clean(element) for element in root.xpath(expression)])


def extract_rows(table) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in table.xpath(".//tr"):
        cells = [text_content(cell) for cell in row.xpath("./th|./td")]
        if len(cells) >= 2 and cells[0] and cells[1]:
            rows.append([cells[0].rstrip(":"), clean(" ".join(cells[1:]))])
    return rows


def sitemap_urls(source: str) -> list[str]:
    return unique([html_module.unescape(value) for value in re.findall(r"<loc>([^<]+)</loc>", source, re.I)])


def baxi_asset_url(value: str, page_url: str) -> str:
    value = html_module.unescape(value or "")
    marker = value.find("assets/")
    if marker >= 0:
        return urllib.parse.urljoin(BAXI_ROOT, value[marker:])
    return urllib.parse.urljoin(page_url, value)


def baxi_page_is_archived(url: str) -> bool:
    path = urllib.parse.unquote(urllib.parse.urlsplit(url).path).lower()
    return bool(re.search(r"(?:archive|arxі?v|znyat-z-virobnicztva|знят-з-виробництва|teplov-nasosi-znyat|gazovi-kotly-archive)", path))


def baxi_active_product_urls(sitemap_source: str) -> list[str]:
    blocked = re.compile(r"(?:archive|arxі?v|znyat-z-virobnicztva|teplov-nasosi-znyat|gazovi-kotly-archive)", re.I)
    result: list[str] = []
    for url in sitemap_urls(sitemap_source):
        path = urllib.parse.unquote(urllib.parse.urlsplit(url).path)
        if "/page/produkcziya/" not in path or not path.endswith(".html"):
            continue
        if blocked.search(path) or "/kopiya-" in path:
            continue
        if path.endswith("/kondensaczjn-kotli.html"):
            continue
        result.append(url)
    return unique(result)


def baxi_classification(url: str, title: str) -> tuple[str, str, str]:
    value = f"{urllib.parse.unquote(url).lower()} {title.lower()}"
    if "/kondiczoneri/" in value:
        return "climate", "air-conditioners", "Кондиціонер"
    if "/teplov-nasos/" in value:
        return "heating", "heat-pumps", "Тепловий насос"
    if "/nakopichuvaln-baki/" in value:
        return "heating", "hot-water-tanks", "Бойлер непрямого нагріву"
    if "/teplov-sonyachn-sistemi/" in value:
        if "kolektor" in value or "колектор" in value:
            return "heating", "solar-thermal", "Сонячний колектор"
        return "heating", "solar-thermal", "Компонент геліосистеми"
    if "/aksesuari-dlya-dimovidalennya/" in value or "димох" in value:
        return "heating", "flue-systems", "Елемент системи димовидалення"
    if "/aksesuari-dlya-regulyuvannya-temperaturi/" in value or "температур" in value:
        return "heating", "automation", "Автоматика для котла"
    if "/aksesuari/" in value:
        return "heating", "boiler-accessories", "Комплектуючі для котлів"
    if "/promislov" in value:
        return "heating", "industrial-heating", "Промисловий газовий котел"
    return "heating", "gas-boilers", "Газовий котел"


def baxi_model_series(model: str) -> str:
    value = clean(model)
    value = re.sub(r"\s+\d+(?:[.,]\d+)?(?:GA)?$", "", value, flags=re.I)
    value = re.sub(r"\s+1\.\d+(?:GA)?$", "", value, flags=re.I)
    return value or clean(model)


def baxi_page_record(source: str, requested_url: str, final_url: str) -> dict:
    tree = document_tree(source)
    h1 = xpath_texts(tree, "//h1")
    title_text = xpath_texts(tree, "//title")
    title = (h1 or title_text or [Path(urllib.parse.urlsplit(final_url).path).stem])[0]
    canonical = tree.xpath('//link[@rel="canonical"]/@href')
    page_url = urllib.parse.urljoin(final_url, canonical[0]) if canonical else final_url
    main_candidates = tree.xpath('//*[@id="left"] | //main')
    main = main_candidates[0] if main_candidates else tree
    paragraphs = unique([
        text_content(node)
        for node in main.xpath(".//p")
        if 20 <= len(text_content(node)) <= 1800
        and not re.search(r"(?:Компанія BAXI входить|Група посідає|Copyright|Каталоги обладнання компанії|Гарантійні зобов'язання)", text_content(node), re.I)
    ])
    bullets = unique([
        text_content(node)
        for node in main.xpath(".//li")
        if 12 <= len(text_content(node)) <= 600
        and not re.search(r"^(?:Особливості та переваги|Технічна інформація|Сертифікати і дозволи|Положення про доступність)$", text_content(node), re.I)
    ])
    headings = xpath_texts(main, ".//h2|.//h3|.//h4|.//strong")
    images: list[str] = []
    for value in main.xpath(".//img/@src | .//img/@data-src | .//a/@href"):
        if not re.search(r"assets/uploads/images/image_boiler/.+\.(?:png|jpe?g|webp)(?:\?|$)", value, re.I):
            continue
        images.append(baxi_asset_url(value, page_url))
    documents = []
    for link in main.xpath('.//a[contains(translate(@href,"PDF","pdf"),".pdf")]'):
        url = baxi_asset_url(link.get("href", ""), page_url)
        documents.append({"title": text_content(link) or urllib.parse.unquote(Path(urllib.parse.urlsplit(url).path).name), "url": url})
    details: list[list[str]] = []
    for value in bullets + paragraphs:
        match = re.match(r"^([^:]{2,80}):\s*(.{1,350})$", value)
        if match:
            details.append([clean(match.group(1)), clean(match.group(2))])
    for paragraph in paragraphs:
        match = re.fullmatch(r"(?:Потужність|Об[’']єм бака|Одноконтурні і двохконтурні моделі)\s+(.+)", paragraph, re.I)
        if match:
            details.append(["Модельний ряд", match.group(1)])
    category, subcategory, product_type = baxi_classification(page_url, title)
    return {
        "brand": "BAXI",
        "requestedUrl": requested_url,
        "manufacturerUrl": page_url,
        "category": category,
        "subcategory": subcategory,
        "productType": product_type,
        "series": re.sub(r"\s*\([^)]*\)\s*$", "", title).strip(),
        "model": title,
        "title": title if re.search(r"\bBAXI\b", title, re.I) else f"BAXI {title}",
        "manufacturerCode": "",
        "ean": "",
        "sourceCategory": product_type,
        "shortSourceDescription": paragraphs[0] if paragraphs else "",
        "content": {"headings": headings, "paragraphs": paragraphs, "bullets": bullets},
        "technicalDetails": details,
        "gallery": unique(images),
        "documents": list({item["url"]: item for item in documents}.values()),
        "archived": baxi_page_is_archived(page_url),
        "dateVerified": VERIFIED_ON,
    }


def parse_baxi_ecatalog(source: str) -> list[dict]:
    tree = document_tree(source)
    records: list[dict] = []
    for card in tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," catalog ") and .//h3/a]'):
        title = (xpath_texts(card, ".//h3/a") or [""])[0]
        href = (card.xpath(".//h3/a/@href") or [""])[0]
        image = (card.xpath(".//img/@src") or [""])[0]
        tables = card.xpath(".//table")
        details = extract_rows(tables[0]) if tables else []
        if not title or not href or not details:
            continue
        records.append({
            "model": title,
            "title": f"Газовий котел BAXI {title}",
            "series": baxi_model_series(title),
            "manufacturerUrl": urllib.parse.urljoin(BAXI_ROOT, href.lstrip("/")),
            "ecatalogUrl": BAXI_ECATALOG,
            "ecatalogImage": baxi_asset_url(image, BAXI_ECATALOG),
            "technicalDetails": details,
        })
    return records


def normalize_baxi_ecatalog(records: list[dict], pages: list[dict]) -> list[dict]:
    by_filename = {Path(urllib.parse.urlsplit(page["manufacturerUrl"]).path).name: page for page in pages}
    current_mp = next((page for page in pages if "luna-duo-tec-mp-plus-(35-110-kvt).html" in page["manufacturerUrl"]), None)
    output: list[dict] = []
    for record in records:
        filename = Path(urllib.parse.urlsplit(record["manufacturerUrl"]).path).name
        page = by_filename.get(filename)
        if record["series"].lower().startswith("luna duo-tec mp+") and current_mp:
            page = current_mp
        page = page or {
            "manufacturerUrl": record["manufacturerUrl"],
            "content": {"headings": [], "paragraphs": [], "bullets": []},
            "gallery": [],
            "documents": [],
            "shortSourceDescription": "",
            "archived": baxi_page_is_archived(record["manufacturerUrl"]),
        }
        archived = bool(page.get("archived"))
        output.append({
            "brand": "BAXI",
            "requestedUrl": record["manufacturerUrl"],
            "manufacturerUrl": page["manufacturerUrl"],
            "ecatalogUrl": record["ecatalogUrl"],
            "category": "heating",
            "subcategory": "industrial-heating" if re.search(r"(?:POWER HT|Duo-tec MP)", record["model"], re.I) else "gas-boilers",
            "productType": "Промисловий газовий котел" if re.search(r"(?:POWER HT|Duo-tec MP)", record["model"], re.I) else "Газовий котел",
            "series": record["series"],
            "model": record["model"],
            "title": record["title"],
            "manufacturerCode": "",
            "ean": "",
            "sourceCategory": "Промислові газові котли" if re.search(r"(?:POWER HT|Duo-tec MP)", record["model"], re.I) else "Газові котли",
            "shortSourceDescription": page.get("shortSourceDescription", ""),
            "content": page.get("content", {"headings": [], "paragraphs": [], "bullets": []}),
            "technicalDetails": record["technicalDetails"],
            "gallery": unique([record["ecatalogImage"], *page.get("gallery", [])]),
            "documents": page.get("documents", []),
            "archived": archived,
            "dateVerified": VERIFIED_ON,
        })
    return output


def buderus_domestic_urls(source: str) -> list[str]:
    selected: list[str] = []
    named_series = re.compile(
        r"/(?:logamax-plus-(?:gb122i|gb172i|gb172-24i-t50|gb062|gb172i2)|compress-(?:3000-aw|7000i-aw|6000-lw|7000-lw|3400i-aws|5800i-aw)|logamatic-(?:tc100|rc100|rc200|rc310|mm100|ms100|mp100|mz100|mc110-|ms200|sc20|sc300))-",
        re.I,
    )
    for url in sitemap_urls(source):
        path = urllib.parse.unquote(url).lower()
        if not re.search(r"-\d+-p/?$", url):
            continue
        if named_series.search(path) or "/logalux-" in path or "/logasol-" in path:
            selected.append(url)
    return selected


def buderus_classification(title: str) -> tuple[str, str, str]:
    lower = title.lower()
    if lower.startswith("logamax"):
        return "heating", "gas-boilers", "Газовий котел"
    if lower.startswith("compress"):
        return "heating", "heat-pumps", "Тепловий насос"
    if lower.startswith("logasol"):
        return "heating", "solar-thermal", "Сонячний колектор"
    if lower.startswith("logamatic"):
        return "heating", "automation", "Автоматика опалення"
    if re.match(r"logalux p(?:r|nr|nrz)", lower):
        return "heating", "heat-accumulators", "Буферна ємність"
    return "heating", "hot-water-tanks", "Бак непрямого нагріву"


def buderus_image_candidates(tree, page_url: str) -> list[str]:
    values: list[str] = []
    values.extend(tree.xpath('//meta[@property="og:image"]/@content'))
    values.extend(tree.xpath('//img/@src | //img/@data-src | //source/@srcset'))
    urls: list[str] = []
    for value in values:
        for part in re.split(r"\s*,\s*", value):
            candidate = part.strip().split(" ")[0]
            candidate = urllib.parse.urljoin(page_url, candidate)
            if "/ocsmedia/optimized/" not in candidate or not re.search(r"\.(?:png|jpe?g|webp)(?:\?|$)", candidate, re.I):
                continue
            urls.append(candidate)
    def key(url: str) -> str:
        return Path(urllib.parse.urlsplit(url).path).name.rsplit(".", 1)[0].lower()
    def score(url: str) -> tuple[int, int]:
        match = re.search(r"/optimized/(\d+)x(\d+)/", url)
        area = int(match.group(1)) * int(match.group(2)) if match else 0
        return area, 1 if url.lower().endswith(".webp") else 0
    best: dict[str, str] = {}
    for url in urls:
        current = best.get(key(url))
        if not current or score(url) > score(current):
            best[key(url)] = url
    return list(best.values())


def buderus_documents(tree, page_url: str) -> list[dict]:
    documents: list[dict] = []
    for link in tree.xpath('.//a[contains(translate(@href,"PDF","pdf"),".pdf")]'):
        url = urllib.parse.urljoin(page_url, link.get("href", ""))
        if not re.search(r"(?:buderus\.com|boschhc-documents\.com|azurewebsites\.net)", url, re.I):
            continue
        documents.append({"title": text_content(link) or urllib.parse.unquote(Path(urllib.parse.urlsplit(url).path).name), "url": url})
    return list({item["url"]: item for item in documents}.values())


def parse_buderus(source: str, requested_url: str, final_url: str) -> list[dict]:
    tree = document_tree(source)
    canonical = tree.xpath('//link[@rel="canonical"]/@href')
    page_url = urllib.parse.urljoin(final_url, canonical[0]) if canonical else final_url
    title = (xpath_texts(tree, "//h1") or xpath_texts(tree, "//title") or [Path(urllib.parse.urlsplit(page_url).path).stem])[0]
    main_candidates = tree.xpath("//main")
    main = main_candidates[0] if main_candidates else tree
    paragraphs = unique([
        text_content(node)
        for node in main.xpath(".//p")
        if 20 <= len(text_content(node)) <= 1600
        and not re.search(r"^(?:Перейти до основного змісту|Пропустити список посилань|©)", text_content(node), re.I)
    ])
    headings = unique([
        value for value in xpath_texts(main, ".//h2|.//h3|.//h4")
        if value not in {"Переваги", "Технічні характеристики та документи", "Завантаження", "Підтримка", "Контакти", "Про компанію"}
    ])
    bullets = unique([
        text_content(node)
        for node in main.xpath('.//*[contains(@class,"Benefit") or contains(@class,"benefit")]//p | .//*[contains(@class,"Benefit") or contains(@class,"benefit")]//h3 | .//ul/li')
        if 15 <= len(text_content(node)) <= 700
    ])
    category, subcategory, product_type = buderus_classification(title)
    images = buderus_image_candidates(tree, page_url)
    documents = buderus_documents(tree, page_url)
    variant_tables = tree.xpath('//*[@id="variantsApi"]//table')
    variants: list[dict] = []
    for table in variant_tables:
        details = extract_rows(table)
        if not details:
            continue
        if len(details) <= 1 and not any(re.search(r"тип виробу|модель|артикул|article", label, re.I) for label, _ in details):
            continue
        lookup = {label.lower(): value for label, value in details}
        model = next((value for label, value in details if re.search(r"тип виробу|модель|product type", label, re.I)), title)
        code = next((value for label, value in details if re.search(r"артикулярний номер|артикул|article", label, re.I)), "")
        signature = (model, code, tuple(tuple(row) for row in details))
        if any(item.get("_signature") == signature for item in variants):
            continue
        variants.append({"model": model, "manufacturerCode": code, "technicalDetails": details, "_signature": signature})
    if not variants:
        variants = [{"model": title, "manufacturerCode": "", "technicalDetails": []}]
    records: list[dict] = []
    for variant in variants:
        model = variant["model"] if variant["model"] and variant["model"].lower() != "продукт" else title
        product_title = f"{product_type} Buderus {model}"
        records.append({
            "brand": "Buderus",
            "requestedUrl": requested_url,
            "manufacturerUrl": page_url,
            "category": category,
            "subcategory": subcategory,
            "productType": product_type,
            "series": title,
            "model": model,
            "title": product_title,
            "manufacturerCode": variant["manufacturerCode"],
            "ean": "",
            "sourceCategory": product_type,
            "shortSourceDescription": paragraphs[0] if paragraphs else "",
            "content": {"headings": headings, "paragraphs": paragraphs, "bullets": bullets},
            "technicalDetails": variant["technicalDetails"],
            "gallery": images,
            "documents": documents,
            "archived": False,
            "domesticConfirmed": True,
            "dateVerified": VERIFIED_ON,
        })
    return records


def fetch_baxi_page(url: str) -> tuple[dict | None, dict | None]:
    try:
        source, final_url = fetch_text(url)
        return baxi_page_record(source, url, final_url), None
    except Exception as error:
        return None, {"brand": "BAXI", "url": url, "error": str(error)}


def fetch_buderus_page(url: str) -> tuple[list[dict], dict | None]:
    try:
        source, final_url = fetch_text(url)
        return parse_buderus(source, url, final_url), None
    except Exception as error:
        return [], {"brand": "Buderus", "url": url, "error": str(error)}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    baxi_sitemap_source, _ = fetch_text(BAXI_SITEMAP)
    baxi_ecatalog_source, _ = fetch_text(BAXI_ECATALOG)
    buderus_sitemap_source, _ = fetch_text(BUDERUS_SITEMAP)
    baxi_urls = baxi_active_product_urls(baxi_sitemap_source)
    buderus_urls = buderus_domestic_urls(buderus_sitemap_source)
    ecatalog_records = parse_baxi_ecatalog(baxi_ecatalog_source)
    if len(ecatalog_records) != 50:
        raise RuntimeError(f"Expected 50 BAXI E-catalog records, received {len(ecatalog_records)}")
    print(f"Scope: {len(ecatalog_records)} BAXI E-catalog models, {len(baxi_urls)} active BAXI pages, {len(buderus_urls)} domestic Buderus pages", flush=True)

    baxi_pages: list[dict] = []
    failures: list[dict] = []
    for index, url in enumerate(baxi_urls, 1):
        page, failure = fetch_baxi_page(url)
        if page:
            baxi_pages.append(page)
        if failure:
            failures.append(failure)
        print(f"BAXI page {index}/{len(baxi_urls)}", flush=True)
        if index < len(baxi_urls):
            time.sleep(10)

    buderus_products: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(fetch_buderus_page, url): url for url in buderus_urls}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            records, failure = future.result()
            buderus_products.extend(records)
            if failure:
                failures.append(failure)
            print(f"Buderus page {index}/{len(buderus_urls)}", flush=True)

    baxi_products = normalize_baxi_ecatalog(ecatalog_records, baxi_pages)
    boiler_page_filenames = {
        Path(urllib.parse.urlsplit(product["manufacturerUrl"]).path).name
        for product in baxi_products
        if product["manufacturerUrl"]
    }
    standalone_baxi = [
        page for page in baxi_pages
        if Path(urllib.parse.urlsplit(page["manufacturerUrl"]).path).name not in boiler_page_filenames
    ]
    products = baxi_products + standalone_baxi + buderus_products
    payload = {
        "verifiedOn": VERIFIED_ON,
        "sources": {
            "baxiSitemap": BAXI_SITEMAP,
            "baxiEcatalog": BAXI_ECATALOG,
            "buderusSitemap": BUDERUS_SITEMAP,
        },
        "scope": {
            "baxiEcatalogModels": len(ecatalog_records),
            "baxiActivePages": len(baxi_pages),
            "baxiStandaloneProducts": len(standalone_baxi),
            "buderusDomesticPages": len(buderus_urls),
            "buderusVariants": len(buderus_products),
        },
        "products": products,
        "failures": failures,
    }
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"productCount": len(products), "scope": payload["scope"], "failures": failures}, ensure_ascii=False, indent=2), flush=True)
    if failures:
        raise RuntimeError(f"Source fetch completed with {len(failures)} failures")


if __name__ == "__main__":
    main()
