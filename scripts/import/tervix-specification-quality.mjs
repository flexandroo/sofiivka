// Pure dimensional-quality rule. Never infer watts from a power-supply rating.
export function curateTervixSpecifications(rows, { sku, sourceUrl } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("Specification rows must be an array.");
  const characteristics = [], sourceIssues = [];
  const amperes = /\d+(?:[.,]\d+)?\s*(?:m|м)?[AА](?![\p{L}])/u;
  const watts = /\d+(?:[.,]\d+)?\s*(?:[кkмm])?(?:Вт|W)(?![\p{L}])/u;
  for (const input of rows) {
    const row = { ...input };
    const value = `${row.value ?? ""}${row.unit ? " " + row.unit : ""}`;
    if (/потужн|power/i.test(row.label || "") && amperes.test(value) && !watts.test(value)) {
      sourceIssues.push({ code: "power-current-unit-mismatch", field: row.label, values: [value], originalCharacteristic: row,
        ...(sku ? { sku } : {}), ...(sourceUrl ? { sourceUrl } : {}),
        resolution: "Не переноситься до публічної картки: для потужності наведено одиницю струму; значення споживання не підтверджено." });
    } else characteristics.push(row);
  }
  return { characteristics, sourceIssues };
}
