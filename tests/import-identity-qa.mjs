import assert from 'node:assert/strict';
import {stableImportId} from '../scripts/import/product-identity.mjs';

assert.equal(stableImportId('test-supplier','src-NEW-1'),'test-supplier-src-new-1');
assert.equal(stableImportId('hunter','hunter-PGP-04'),'hunter-pgp-04');
assert.equal(stableImportId('general-fittings','5F00O2H040000H'),'general-fittings-5f00o2h040000h');
const sourceIds=['ua-47832131515П','ua-47832131515ПБК','ua-VLP462200401615П','ua-VLP462200401615ПБК','ua-VLP462200501615П','ua-VLP462200501615ПБК'];
const publicIds=sourceIds.map(id=>stableImportId('valrom',id));
assert.equal(new Set(publicIds).size,sourceIds.length,'distinct manufacturer suffixes must stay distinct');
assert.ok(publicIds.every(id=>/^[a-z0-9._-]+$/.test(id)));
assert.deepEqual(sourceIds.map(id=>stableImportId('valrom',id)),publicIds,'stable across repeated collection');
assert.notEqual(stableImportId('test','A/B'),stableImportId('test','A-B'),'lossy punctuation must not collide');
assert.throws(()=>stableImportId('../bad','x'),/Invalid/);
assert.throws(()=>stableImportId('test',' '),/empty/);
console.log(JSON.stringify({status:'ok',checks:'import-source-identities',unicodeVariants:sourceIds.length,asciiCompatibility:true}));
