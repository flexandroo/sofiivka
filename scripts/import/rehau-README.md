# REHAU engineering import

The authoritative Ukrainian index is [REHAU Water](https://water.rehau.com/ua-uk/poshuk-produktiv), which links public OXOMI portal `3001044`. The official [German engineering ePaper](https://gebaeudetechnik.rehau.de/epaper) links portal `3000126`. Exact manufacturer articles from either regional portal are eligible; separate MEPA sanitary products, services and documentation records are outside the import. No dealer catalogue is a primary source.

The 2026-11-25/26 snapshot contains 4,333 exact Ukrainian SKU/internal IDs and 6,800 German SKU from all 114 table pages. Their union contains 8,298 resolved SKU. The independent Ukrainian word-search and recursive variant proof reconciles the portal counter exactly. Search limits and fuzzy prefix counts are never treated as catalogue limits.

## Rebuild

Python requires Pillow, pypdf and pdfplumber; Poppler supplies pdftotext/pdftoppm. Node uses built-in modules. Install dependencies in an isolated environment, without changing the project package manifest. All requests are public GETs. These scripts never mutate the database, hosting, Git or source service.

1. Run `rehau-collect.py inventory`, `complete-inventory`, `docs`, `details`, `complete-details`, `download-docs`, `pdf-inventory`, then `complete-details` again. All OXOMI product/data batches use at most 29 articles. The initial search discovery is incomplete until step 2 passes.
2. Run `node scripts/import/rehau-ua-completeness.mjs --output=imports/rehau-ua-completeness-current.json`, then `rehau-collect.py ingest-ua-completeness --proof=imports/rehau-ua-completeness-current.json`, followed by `complete-details`. Preserve the reviewed frozen proof used as the completeness collector's discovery seed; see its dedicated documentation. A fresh-clone replay uses fresh caches, not a previous snapshot's API results.
3. Run `global-docs`, `media`, `rehau-pdf-rows.py`, `rehau-prepare-review.py` and `recovery-media`. Reviewed description/label/value dictionaries and recovery bindings live beside the scripts. The preparer rebuilds same-SKU Ukrainian alignment; numeric templates require identical ordered numeric literals in the original UA/DE pair.
4. Run `rehau-batch.py`, then `rehau-collect.py attachment-pdfs`, then `rehau-batch.py` again. This includes manufacturer PDF attachments as well as linked catalogue pages. `additional-media` downloads only verified late variant/completeness deltas. After media is frozen for publication, never run full `media` or prune existing files as part of a delta.
5. Validate against a current staged reference containing the reviewed additive metadata: `rehau-audit.py`; `node scripts/import/rehau-semantic-verify.mjs --self-test`; `node scripts/import-check.mjs imports/rehau-2026-11-25.json --reference=imports/reference-wave2-staged.json --check-links`; `rehau-finalize-audit.py`.

The adapter writes the batch and exhaustive resolved-SKU exclusions to `imports/rehau-coverage-audit.json`. Ambiguous PDF table extraction stays in `imports/rehau-pdf-table-omissions.json` with exact article, page, source URL and original row. It is not silently converted to inferred specifications. Six legacy PDF-only articles have separate recovery/audit facts and remain outside publication until current official model availability is proven; they are not labelled discontinued.

## Content rules

Ukrainian exact-SKU copy is primary. German exact-SKU ETIM enriches it because the Ukrainian portal supplies no feature/measurement tables. All raw text, original GTIN/relationships, source prices, translation/template provenance, PDF rows, explicit conflicts and media bindings remain inside `sourceEvidence`. Public descriptions remove manufacturer contacts, prices, return/delivery policy and regional subsidy promises while preserving technical/safety statements.

All storefront prices are null UAH; no EUR amount becomes a hryvnia price. Inventory is unknown. Existing products and prices are protected by the ordinary importer. EAN values require valid GTIN length and checksum. Manufacturer related-article bindings are retained privately; visible related SKU are limited to eligible products in this batch.

Pipe OD, wall and length derive from explicit physical units and genuine pipe identity, not DN or accessory dimensions. Millimetre/gram grouped values and decimal metres have distinct parsing rules; `4.825 m` remains 4.825 m. Cabinet dimensions require explicit ETIM fields or an independently proven table legend; model-code digits are not dimensions. Unsupported filter values are individually logged with source proof.

Images are local WebP with maximum edge 1,600 px. Manufacturer drawings/renders are identified honestly in provenance. Generic previews, installation schematics and adjacent-SKU geometry are rejected. The four-circuit HKV-D illustration belongs only to article 12080411003; other circuit counts stay excluded without their own verified image. PDF titles make no language promise based solely on portal locale. Product files use the repository's Git LFS rules; publishing is a separate root-agent workflow after the full checks pass.
