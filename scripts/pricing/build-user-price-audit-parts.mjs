// Bounded read-only variants of the locally verified full audit; never changes the price release.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DIR=path.join(ROOT,'imports/overnight-prices');
const pointer=JSON.parse(await fs.readFile(path.join(DIR,'release-pointer.json'),'utf8'));
const release=path.dirname(path.resolve(ROOT,pointer.manifest));
const full=await fs.readFile(path.join(release,'final-audit.sql'),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const encodedMatch=full.match(/decode\('([A-Za-z0-9+/=]+)','base64'\)/);
assert.ok(encodedMatch,'Full audit expected data is absent');
const expected=JSON.parse(Buffer.from(encodedMatch[1],'base64').toString('utf8'));
assert.equal(new Set(expected.map(row=>row.legacyId)).size,expected.length,'Duplicate audit identities');
const marker='), active as materialized';
const boundary=full.indexOf(marker);assert.ok(boundary>0,'Full audit query shape changed');
const checkedPrefix=full.slice(full.indexOf('with expected as materialized'),boundary);
const files=[];
async function write(name,kind,sql,rowCount){
  const bytes=Buffer.byteLength(sql);assert.ok(bytes<700000,`${name} exceeds the MCP request budget`);
  await fs.writeFile(path.join(release,name),sql);
  files.push({file:path.relative(ROOT,path.join(release,name)).replaceAll('\\','/'),kind,rowCount,bytes,sha256:sha(sql)});
}
// Each source/price row is checked exactly once, preserving all predicates of the full audit.
for(let offset=0,index=1;offset<expected.length;offset+=500,index++){
  const rows=expected.slice(offset,offset+500);
  const encoded=Buffer.from(JSON.stringify(rows)).toString('base64');
  const sql=`-- Read-only detailed subset ${index}; combine with the global audit.\nset local statement_timeout='30s';\n${checkedPrefix.replace(encodedMatch[1],encoded)})
select jsonb_build_object('pass',count(*)=${rows.length} and count(*)filter(where core_bad)=0 and count(*)filter(where source_bad)=0,
 'scope','price-source-subset','expectedRows',${rows.length},'checkedRows',count(*),
 'coreFailures',count(*)filter(where core_bad),'sourceFailures',count(*)filter(where source_bad))result from checked;\n`;
  await write(`final-audit-details-${String(index).padStart(2,'0')}.sql`,'details',sql,rows.length);
}
// Global anti-joins need only identity, not full provenance. This retains the whole audit's cache/job/count checks.
const identities=expected.map(({legacyId,internalId})=>({legacyId,internalId}));
const encoded=Buffer.from(JSON.stringify(identities)).toString('base64');
let global=`-- Read-only whole-catalogue counts, unsupported prices/sources, public cache and FX job audit.\nset local statement_timeout='30s';
with expected as materialized(select value item from jsonb_array_elements(convert_from(decode('${encoded}','base64'),'UTF8')::jsonb))${full.slice(boundary)}`;
// The boundary includes the checked CTE's closing parenthesis; the compact expected CTE is already closed.
global=global.replace('::jsonb))), active as materialized','::jsonb)), active as materialized');
global=global.replace(/    \(select count\(\*\)from checked where core_bad\)core_failures,\r?\n/,'')
 .replace(/    \(select count\(\*\)from checked where source_bad\)source_failures,\r?\n/,'')
 .replace(' and core_failures=0 and source_failures=0','');
assert.ok(!global.includes('checked where'),'Unexpected detailed predicates in global audit');
await write('final-audit-global.sql','global',global,expected.length);
const manifest={format:'bounded-user-price-audits-v1',fullAuditSha256:sha(full),expectedRows:expected.length,
  detailRows:files.filter(row=>row.kind==='details').reduce((sum,row)=>sum+row.rowCount,0),
  instructions:'Execute every file read-only. Every result.pass must be true; sum detail checkedRows must equal expectedRows.',files};
assert.equal(manifest.detailRows,expected.length);
await fs.writeFile(path.join(release,'audit-parts-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:'PREPARED_READ_ONLY',expectedRows:expected.length,files:files.map(({file,kind,bytes,sha256})=>({file,kind,bytes,sha256})),hostedWrites:0}));
