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
OUT_DIR = ROOT / "tmp" / "heating-brands-source"
OUT_FILE = OUT_DIR / "products.json"
USER_AGENT = "Mozilla/5.0 TD-Sofiivka-Catalog/1.0"
VERIFIED_ON = "2026-09-21"

SOURCES = {
    "altep": "https://altep.ua/sitemap.xml",
    "feniks": "https://feniks.ua/sitemap-product.xml",
    "focus_1": "https://firebox.com.ua/product-sitemap1.xml",
    "focus_2": "https://firebox.com.ua/product-sitemap2.xml",
}


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


def absolute_url(value: str, base: str) -> str:
    return urllib.parse.urljoin(base, html_module.unescape(value or ""))


def fetch_text(url: str, attempts: int = 4) -> tuple[str, str]:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Encoding": "identity",
                },
            )
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
                if data.startswith(b"\x1f\x8b"):
                    data = gzip.decompress(data)
                final_url = response.geturl()
                content_type = response.headers.get_content_charset() or "utf-8"
                try:
                    return data.decode(content_type), final_url
                except (LookupError, UnicodeDecodeError):
                    return data.decode("utf-8", errors="replace"), final_url
        except Exception as error:
            last_error = error
            if attempt < attempts:
                time.sleep(attempt * 0.6)
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def sitemap_urls(text: str, pattern: str) -> list[str]:
    return unique([
        match.group(1)
        for match in re.finditer(r"<loc>([^<]+)</loc>", text, re.IGNORECASE)
        if re.search(pattern, html_module.unescape(match.group(1)))
    ])


def document_tree(source: str):
    return html.fromstring(source)


def text_content(element) -> str:
    return clean(element.text_content()) if element is not None else ""


def xpath_texts(tree, expression: str) -> list[str]:
    return unique([text_content(element) for element in tree.xpath(expression)])


def json_ld_objects(tree) -> list[dict]:
    objects: list[dict] = []
    for script in tree.xpath('//script[@type="application/ld+json"]'):
        try:
            value = json.loads(script.text or "")
        except (TypeError, json.JSONDecodeError):
            continue
        if isinstance(value, dict):
            objects.append(value)
            graph = value.get("@graph")
            if isinstance(graph, list):
                objects.extend(item for item in graph if isinstance(item, dict))
        elif isinstance(value, list):
            objects.extend(item for item in value if isinstance(item, dict))
    return objects


def json_ld_product(tree) -> dict:
    for item in json_ld_objects(tree):
        item_type = item.get("@type")
        types = item_type if isinstance(item_type, list) else [item_type]
        if "Product" in types:
            return item
    return {}


def extract_table_rows(table) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in table.xpath(".//tr"):
        cells = [text_content(cell) for cell in row.xpath("./th|./td")]
        if any(cells):
            rows.append(cells)
    return rows


def extract_page_documents(tree, page_url: str, scope=None) -> list[dict]:
    root = scope if scope is not None else tree
    result: list[dict] = []
    for link in root.xpath('.//a[contains(translate(@href,"PDF","pdf"),".pdf")]'):
        url = absolute_url(link.get("href", ""), page_url)
        title = text_content(link) or urllib.parse.unquote(Path(urllib.parse.urlparse(url).path).name)
        if url:
            result.append({"title": title, "url": url})
    seen: set[str] = set()
    return [item for item in result if not (item["url"] in seen or seen.add(item["url"]))]


def clean_content(values: list[str]) -> list[str]:
    blocked = re.compile(
        r"^(?:головна|магазин|каталог|купити|детальніше|дивитись|відео|опис|характеристики|відгуки|схожі товари)$",
        re.IGNORECASE,
    )
    return unique([
        value
        for value in values
        if 20 <= len(clean(value)) <= 1600 and not blocked.search(clean(value))
    ])


def altep_variant_row(tables: list[list[list[str]]]) -> tuple[list[str], str]:
    preferred = re.compile(r"(?:номінальна\s+)?потужність|об[’'`]єм", re.IGNORECASE)
    for rows in tables:
        for row in rows:
            if len(row) >= 4 and preferred.search(row[0]):
                unit = row[1] if len(row) > 1 else ""
                return row[2:], unit
    for rows in tables:
        for row in rows:
            if len(row) >= 4:
                unit = row[1] if len(row) > 1 else ""
                return row[2:], unit
    return [], ""


def altep_series_name(product_data: dict, h1: str) -> str:
    name = clean(product_data.get("name", ""))
    if name:
        return re.sub(r"^(?:Котел|Твердопаливний котел|Пелетний котел)\s+", "", name, flags=re.IGNORECASE)
    value = re.sub(r"\s+[—–-].*$", "", h1)
    return re.sub(r"^(?:Котел|Твердопаливний котел|Пелетний котел)\s+", "", value, flags=re.IGNORECASE)


def altep_model(series: str, variant: str, unit: str) -> str:
    normalized_unit = clean(unit)
    suffix = normalized_unit if normalized_unit and normalized_unit.lower() not in variant.lower() else ""
    if re.search(r"(?:квт|kw)", normalized_unit, re.IGNORECASE):
        suffix = "кВт"
    elif re.search(r"(?:л|дм3|дм³)", normalized_unit, re.IGNORECASE):
        suffix = "л"
    return clean(f"{series} {variant} {suffix}")


def altep_details_for_variant(tables: list[list[list[str]]], variant_index: int, variants: list[str]) -> list[list[str]]:
    details: list[list[str]] = []
    current_group = ""
    for rows in tables:
        for row in rows:
            if len(row) == 1:
                current_group = row[0]
                continue
            if len(row) < 2 or row[0].lower() in {"параметр", "parameter"}:
                continue
            label, unit = row[0], row[1]
            values = row[2:]
            if len(values) == len(variants):
                value = values[variant_index]
            elif len(values) == 1:
                value = values[0]
            elif len(values) > variant_index:
                value = values[variant_index]
            else:
                continue
            if not value:
                continue
            full_label = f"{current_group}: {label}" if current_group and label.lower() in {"глибина", "об’єм", "об'єм", "висота", "внутрішній діаметр", "площа перерізу"} else label
            formatted = clean(f"{value} {unit}") if unit else value
            details.append([clean(full_label), formatted])
    seen: set[tuple[str, str]] = set()
    result: list[list[str]] = []
    for label, value in details:
        key = (label.lower(), value.lower())
        if key not in seen:
            seen.add(key)
            result.append([label, value])
    return result


def parse_altep(source: str, requested_url: str, final_url: str) -> list[dict]:
    tree = document_tree(source)
    product_data = json_ld_product(tree)
    h1 = (xpath_texts(tree, "//h1") or [clean(product_data.get("name", ""))])[0]
    canonical = tree.xpath('//link[@rel="canonical"]/@href')
    page_url = absolute_url(canonical[0] if canonical else final_url, final_url)
    series = altep_series_name(product_data, h1)
    category = clean(product_data.get("category", ""))
    breadcrumbs = xpath_texts(tree, '//*[contains(@class,"breadcrumbs")]//a')
    tables = [extract_table_rows(table) for table in tree.xpath("//table")]
    variants, unit = altep_variant_row(tables)
    short_description = (xpath_texts(tree, '//*[contains(@class,"prod-short-description")]') or [clean(product_data.get("description", ""))])[0]
    content_roots = tree.xpath('//*[contains(@class,"prod-tabs__body") or contains(@class,"prod-tabs__content")]')
    content_root = content_roots[0] if content_roots else tree
    paragraphs = clean_content(xpath_texts(content_root, ".//p"))
    bullets = clean_content(xpath_texts(content_root, ".//li"))
    headings = unique(xpath_texts(content_root, ".//h2|.//h3|.//h4"))
    gallery_urls = [absolute_url(value, page_url) for value in tree.xpath('//*[contains(@class,"product-photo__thumb")]/@data-src | //*[contains(@class,"product-photo__thumb")]/@src')]
    diagram_urls = [absolute_url(value, page_url) for value in content_root.xpath('.//img/@src') if re.search(r"gabar|габар|паспорт|dimens|схем", value, re.IGNORECASE)]
    images = unique(gallery_urls + diagram_urls)
    documents = extract_page_documents(tree, page_url, content_root)
    base = {
        "brand": "Altep",
        "requestedUrl": requested_url,
        "manufacturerUrl": page_url,
        "series": series,
        "categoryTrail": breadcrumbs or ([category] if category else []),
        "sourceCategory": category,
        "shortSourceDescription": short_description,
        "content": {"headings": headings, "paragraphs": paragraphs, "bullets": bullets},
        "gallery": images,
        "dimensionImages": unique(diagram_urls),
        "documents": documents,
        "manufacturerCode": "",
        "ean": "",
        "dateVerified": VERIFIED_ON,
    }
    if not variants:
        details = []
        for rows in tables:
            for row in rows:
                if len(row) >= 2:
                    details.append([row[0], clean(" ".join(row[1:]))])
        return [{**base, "model": series, "title": clean(product_data.get("name", "")) or h1, "technicalDetails": details}]
    records: list[dict] = []
    for index, variant in enumerate(variants):
        model = altep_model(series, variant, unit)
        records.append({
            **base,
            "model": model,
            "title": clean(f"Altep {model}"),
            "technicalDetails": altep_details_for_variant(tables, index, variants),
        })
    return records


def feniks_original_image(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.replace("/image/cache/", "/image/")
    path = re.sub(r"-\d+x\d+(?=\.[^.]+$)", "", path)
    return urllib.parse.urlunparse(parsed._replace(path=path))


def feniks_series_from_product(product_data: dict, title: str) -> str:
    model = clean(product_data.get("model", ""))
    match = re.search(r"сер(?:і|и)я\s+([A-ZА-ЯІЇЄҐ]+(?:\s+(?:new|pellet))?)", title, re.IGNORECASE)
    if match:
        return clean(f"Серія {match.group(1)}")
    if model:
        return clean(model.replace("Series", "Серія"))
    if re.search(r"теплоакумулятор", title, re.IGNORECASE):
        return "Теплоакумулятори"
    if re.search(r"пальник", title, re.IGNORECASE):
        return "Пелетні пальники"
    if re.search(r"бункер", title, re.IGNORECASE):
        return "Бункери"
    return "FENIKS"


def feniks_document_for_series(documents: list[dict], series: str, title: str) -> list[dict]:
    value = f"{series} {title}".lower()
    candidates: list[str] = []
    match = re.search(r"серія\s+([a-zа-яіїєґ]+)(?:\s+(new|pellet))?", value, re.IGNORECASE)
    if match:
        letter = match.group(1).lower()
        suffix = (match.group(2) or "").lower()
        candidates.extend([f"seria_{letter}_{suffix}".strip("_"), f"seria_{letter}"])
        if suffix == "new" or letter == "b":
            candidates.append("seria_bn")
    selected = [item for item in documents if any(token in item["url"].lower() for token in candidates)]
    if selected:
        return selected[:2]
    return [item for item in documents if re.search(r"catalog\.pdf$", item["url"], re.IGNORECASE)][:1]


def parse_feniks(source: str, requested_url: str, final_url: str) -> list[dict]:
    tree = document_tree(source)
    product_data = json_ld_product(tree)
    h1 = (xpath_texts(tree, "//h1") or [clean(product_data.get("name", ""))])[0]
    canonical = tree.xpath('//link[@rel="canonical"]/@href')
    page_url = absolute_url(canonical[0] if canonical else final_url, final_url)
    categories = unique([part for part in clean(product_data.get("category", "")).split(",") if clean(part)])
    series_category = next((value for value in reversed(categories) if re.search(r"серія|серия", value, re.IGNORECASE)), "")
    if series_category:
        series = series_category
    elif any(re.search(r"теплоакумулятор", value, re.IGNORECASE) for value in categories):
        accumulator = re.search(r"\b(Т[АA]\d?[A-ZА-ЯІЇЄҐ]?)\.", h1, re.IGNORECASE)
        series = f"Теплоакумулятори {accumulator.group(1).upper()}" if accumulator else "Теплоакумулятори"
    elif any(re.search(r"пальник", value, re.IGNORECASE) for value in categories):
        series = "Пелетні пальники"
    elif any(re.search(r"бункер", value, re.IGNORECASE) for value in categories):
        series = "Бункери"
    else:
        series = feniks_series_from_product(product_data, h1)
    details: list[list[str]] = []
    for group in tree.xpath('//*[@id="us-product-attributes"]//*[contains(@class,"us-product-attributes-cont")]'):
        group_title = (xpath_texts(group, './/*[contains(@class,"us-product-attributes-title")]') or [""])[0]
        for item in group.xpath('.//*[contains(@class,"us-product-attr-item")]'):
            parts = xpath_texts(item, "./span")
            if len(parts) >= 2:
                label = f"{group_title}: {parts[0]}" if group_title and group_title.lower() != "характеристики" else parts[0]
                details.append([label, parts[1]])
    product_area = (tree.xpath('//*[contains(@class,"us-product-left")]') or [tree])[0]
    image_urls = unique([feniks_original_image(absolute_url(value, page_url)) for value in product_area.xpath('.//img[contains(@src,"-1200x1200")]/@src')])
    description_roots = tree.xpath('//*[contains(@class,"us-product-descr")]')
    description_root = description_roots[0] if description_roots else tree
    paragraphs = clean_content(xpath_texts(description_root, ".//p"))
    bullets = clean_content(xpath_texts(description_root, ".//li"))
    headings = unique(xpath_texts(description_root, ".//h2|.//h3|.//h4|.//strong"))
    all_documents = extract_page_documents(tree, page_url)
    documents = feniks_document_for_series(all_documents, series, h1)
    sku = clean(product_data.get("sku", ""))
    short_source = clean(product_data.get("description", ""))
    return [{
        "brand": "FENIKS",
        "requestedUrl": requested_url,
        "manufacturerUrl": page_url,
        "series": series,
        "model": h1,
        "title": h1,
        "manufacturerCode": sku,
        "ean": "",
        "categoryTrail": categories,
        "sourceCategory": categories[-1] if categories else "",
        "shortSourceDescription": short_source,
        "content": {"headings": headings, "paragraphs": paragraphs, "bullets": bullets},
        "technicalDetails": details,
        "gallery": image_urls,
        "dimensionImages": [],
        "documents": documents,
        "dateVerified": VERIFIED_ON,
    }]


def focus_category_from_tree(tree) -> list[str]:
    breadcrumbs = xpath_texts(tree, '//*[contains(@class,"breadcrumbs")]//a')
    return [value for value in breadcrumbs if value.lower() not in {"головна", "товари", "магазин"}]


def focus_details(description_root) -> list[list[str]]:
    details: list[list[str]] = []
    for table in description_root.xpath(".//table"):
        for row in extract_table_rows(table):
            if len(row) >= 2:
                details.append([row[0], clean("; ".join(row[1:]))])
    candidates = description_root.xpath(".//p|.//li")
    for element in candidates:
        value = text_content(element)
        if len(value) > 500:
            continue
        match = re.match(r"^([^:–—]{2,90})\s*[:–—]\s*(.{1,300})$", value)
        if match:
            label, detail = clean(match.group(1)), clean(match.group(2))
            if label and detail:
                details.append([label, detail])
    seen: set[tuple[str, str]] = set()
    result: list[list[str]] = []
    for label, value in details:
        key = (label.lower(), value.lower())
        if key not in seen:
            seen.add(key)
            result.append([label, value])
    return result


def focus_is_own_product(page_url: str, title: str, description: str) -> bool:
    path = urllib.parse.urlparse(page_url).path.lower()
    if "/komplektuyushhie-pelletnyh-gorelok-i-tverdotoplivnyh-kotlov/" not in path:
        return True
    if "/avtomatika/" in path or "/avtomatika-kontrolya-klimata/" in path:
        return False
    source = f"{title} {description} {path}".lower()
    excluded = re.compile(r"\b(?:plum|pellas|imp pumps|grundfos|wilo)\b", re.IGNORECASE)
    return not excluded.search(source)


def parse_focus(source: str, requested_url: str, final_url: str) -> list[dict]:
    tree = document_tree(source)
    product_data = json_ld_product(tree)
    title_candidates = xpath_texts(tree, '//*[contains(@class,"product-main")]//h1[contains(@class,"product-title")] | //h1[contains(@class,"product-title")]')
    title = (title_candidates or [clean(product_data.get("name", "")).replace(" » FireBox", "")])[0]
    canonical = tree.xpath('//link[@rel="canonical"]/@href')
    page_url = absolute_url(canonical[0] if canonical else final_url, final_url)
    short_nodes = tree.xpath('//*[contains(@class,"product-short-description")]')
    short_source = text_content(short_nodes[0]) if short_nodes else clean(product_data.get("description", ""))
    if not title or not focus_is_own_product(page_url, title, short_source):
        return []
    categories = focus_category_from_tree(tree)
    description_nodes = tree.xpath('//*[@id="tab-description"]')
    description_root = description_nodes[0] if description_nodes else (short_nodes[0] if short_nodes else tree)
    paragraphs = clean_content(xpath_texts(description_root, ".//p|.//div[not(*)]"))
    bullets = clean_content(xpath_texts(description_root, ".//li"))
    headings = unique(xpath_texts(description_root, ".//h1|.//h2|.//h3|.//h4"))
    details = focus_details(description_root)
    gallery_roots = tree.xpath('//*[contains(@class,"woocommerce-product-gallery")]')
    gallery_root = gallery_roots[0] if gallery_roots else tree
    gallery = unique([
        absolute_url(value, page_url)
        for value in gallery_root.xpath('.//@data-large_image | .//a/@href | .//img/@data-src')
        if re.search(r"\.(?:avif|webp|png|jpe?g)(?:\?|$)", value, re.IGNORECASE)
    ])
    product_container = (tree.xpath('//*[contains(@class,"product-container")]') or [description_root])[0]
    documents = extract_page_documents(tree, page_url, product_container)
    sku = clean(product_data.get("sku", ""))
    body_classes = " ".join(tree.xpath("//body/@class"))
    product_categories = re.findall(r"product_cat-([^\s]+)", body_classes)
    series = categories[-1] if categories else (product_categories[-1].replace("-", " ").title() if product_categories else "FOCUS")
    return [{
        "brand": "FOCUS",
        "requestedUrl": requested_url,
        "manufacturerUrl": page_url,
        "series": series,
        "model": title,
        "title": title,
        "manufacturerCode": sku,
        "ean": "",
        "categoryTrail": categories,
        "sourceCategory": categories[-1] if categories else "",
        "sourceCategorySlugs": product_categories,
        "shortSourceDescription": short_source,
        "content": {"headings": headings, "paragraphs": paragraphs, "bullets": bullets},
        "technicalDetails": details,
        "gallery": gallery,
        "dimensionImages": [url for url in gallery if re.search(r"gabar|dimens|schema|skhem", url, re.IGNORECASE)],
        "documents": documents,
        "dateVerified": VERIFIED_ON,
    }]


def fetch_product(brand: str, url: str) -> tuple[list[dict], dict | None]:
    try:
        source, final_url = fetch_text(url)
        if brand == "altep":
            return parse_altep(source, url, final_url), None
        if brand == "feniks":
            return parse_feniks(source, url, final_url), None
        return parse_focus(source, url, final_url), None
    except Exception as error:
        return [], {"brand": brand, "url": url, "error": str(error)}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source_texts: dict[str, str] = {}
    for key, url in SOURCES.items():
        source_texts[key], _ = fetch_text(url)

    queues = {
        "altep": sitemap_urls(source_texts["altep"], r"^https://altep\.ua/catalog/.+/p\d+$"),
        "feniks": sitemap_urls(source_texts["feniks"], r"^https://feniks\.ua/[^/]+$"),
        "focus": unique(
            sitemap_urls(source_texts["focus_1"], r"^https://firebox\.com\.ua/uk/.+/$")
            + sitemap_urls(source_texts["focus_2"], r"^https://firebox\.com\.ua/uk/.+/$")
        ),
    }
    expected = {"altep": 32, "feniks": 328, "focus": 380}
    for brand, count in expected.items():
        if len(queues[brand]) != count:
            raise RuntimeError(f"Expected {count} {brand} URLs, received {len(queues[brand])}")

    jobs = [(brand, url) for brand, urls in queues.items() for url in urls]
    products: list[dict] = []
    failures: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        future_map = {executor.submit(fetch_product, brand, url): (brand, url) for brand, url in jobs}
        for index, future in enumerate(concurrent.futures.as_completed(future_map), 1):
            records, failure = future.result()
            products.extend(records)
            if failure:
                failures.append(failure)
            if index % 25 == 0 or index == len(jobs):
                print(f"Fetched {index}/{len(jobs)} pages; {len(products)} product records; {len(failures)} failures")

    products.sort(key=lambda product: (product["brand"].lower(), product["series"].lower(), product["model"].lower()))
    payload = {
        "verifiedOn": VERIFIED_ON,
        "sources": SOURCES,
        "urlCounts": {brand: len(urls) for brand, urls in queues.items()},
        "recordCounts": {
            brand: sum(1 for product in products if product["brand"].lower() == brand)
            for brand in ("altep", "feniks", "focus")
        },
        "failures": failures,
        "products": products,
    }
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "urlCounts": payload["urlCounts"],
        "recordCounts": payload["recordCounts"],
        "failures": len(failures),
        "withImages": sum(1 for product in products if product["gallery"]),
        "imageReferences": sum(len(product["gallery"]) for product in products),
        "withTechnicalDetails": sum(1 for product in products if product["technicalDetails"]),
        "withDocuments": sum(1 for product in products if product["documents"]),
        "output": str(OUT_FILE),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
