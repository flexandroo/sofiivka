(function () {
  "use strict";

  // Sale units are explicit catalogue data. A pipe name, coil length or pack
  // quantity never changes what one unit of the displayed price buys.
  function code(productOrUnit) {
    const value = typeof productOrUnit === "string" ? productOrUnit
      : productOrUnit?.pricing?.unit ?? productOrUnit?.saleUnit ?? productOrUnit?.sale_unit;
    return value === "m" ? "m" : "piece";
  }
  const label = productOrUnit => code(productOrUnit) === "m" ? "м" : "шт.";
  const price = (amount, productOrUnit, money) => `${money(amount)}${code(productOrUnit) === "m" ? "/м" : ""}`;
  const quantityLabel = (quantity, productOrUnit) => `${quantity} ${label(productOrUnit)}`;
  const wholeQuantity = (value, maximum = 999) => Math.min(maximum, Math.max(1, Math.round(Number(value) || 1)));
  function basket(lines) {
    const units = new Set(lines.map(line => code(line.product)));
    const mixed = units.size > 1;
    const count = mixed ? lines.length : lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    return Object.freeze({ count, positions: lines.length, mixed, label: `${count} ${mixed ? "поз." : label(lines[0]?.product)}` });
  }

  window.sofievkaSalesUnits = Object.freeze({ code, label, price, quantityLabel, wholeQuantity, basket });
})();
