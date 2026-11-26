// User-authorized policy, 26 November 2026. Source quotes remain separate from rounded site prices.
import assert from 'node:assert/strict';
import {rational} from './user-prices.mjs';
export const REHAU_WORKBOOK_SHA='d0a968b79bd68a9fcf6ccee72db5e82ee6ece13686b1728fec2456494885fce4';
export const CURRENCY_PRICE_POLICY=Object.freeze({version:'user-nbu-markup-2026-11-26',authorizedOn:'2026-11-26',markupPercent:2.5,
  foreignFormula:'sourceAmount × NBU(sourceCurrency, rateDate) × 1.025; round once to whole UAH',
  rehauCurrencyLabel:'Евро Рехау',rehauCurrency:'EUR',unknownVat:'as_quoted',uah:'no_fx_or_currency_markup'});
export function approvedCurrency(quote){
 if(quote.brand==='rehau'&&quote.source?.fileSha256===REHAU_WORKBOOK_SHA&&quote.source.currencyLabel==='Евро Рехау')return'EUR';
 if(['UAH','EUR','USD'].includes(quote.currency))return quote.currency;
 throw Error('Unapproved or unsupported source currency');
}
export function documentedRehauMaterial(sku){assert.match(sku,/^\d{9}$/);return`1${sku.slice(0,6)}1${sku.slice(6)}`;}
export function convertAsQuotedToUah(amount,currency,policy){
 assert.match(currency,/^[A-Z]{3}$/);const value=rational(amount);assert.ok(value.n>0n);
 let numerator=value.n,denominator=value.d;
 if(currency!=='UAH'){
  assert.equal(policy.settings.enabled,true);assert.equal(Number(policy.settings.markup_percent),2.5,'The authorized markup is exactly2.5%, applied once');
  const rate=policy.latestRates.find(row=>row.currency===currency);assert.ok(rate&&rate.source==='NBU','A verified NBU rate is required; never guess');
  assert.match(rate.rate_date,/^\d{4}-\d{2}-\d{2}$/);const fx=rational(rate.rate);assert.ok(fx.n>0n);
  numerator*=fx.n*1025n;denominator*=fx.d*1000n;
 }
 const rounded=(2n*numerator+denominator)/(2n*denominator);assert.ok(rounded>0n&&rounded<=BigInt(Number.MAX_SAFE_INTEGER));return Number(rounded);
}
