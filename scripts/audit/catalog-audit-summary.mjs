// Reconcile detector flags with source adjudications. Flags are not automatically factual errors.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'imports/overnight-audit');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const audit=read('imports/overnight-audit/audit-summary.json'),findings=read('imports/overnight-audit/findings.json').findings;
const plan=read('imports/overnight-audit/catalog-repair-plan.json'),scope=read('imports/overnight-audit/rehau-scope-extension-review.json');
const signedById=new Map(plan.products.filter(x=>x.sourceChanges.length).map(x=>[x.id,x]));
const numeric=read('imports/overnight-audit/base-review/imported-numeric-adjudications.json');
const numericBySku=new Map(numeric.results.map(x=>[x.sku,x]));
const cone=new Set(['11691691001','12446161001','12446661001']);
const preciseAngles=new Set(['11002551001','11002591001','11002761001','11002781001']);
const decisions=findings.map(f=>{
  let decision,reason,proof;
  switch(f.kind){
    case 'ETIM-characteristic-value-disagreement':
      if(/^\s*[-−–]\s*\d/.test(f.evidence.sourceValue)){
        assert.ok(signedById.has(f.id));
        if(f.evidence.etimCode==='EF020023'){
          decision='approved-upstream-MAX-conflict-withdrawal';reason='The exact signed source projection was restored in510, then independently adjudicated: the manufacturer MAX=-10 field conflicts with its exact-SKU qualified -10..95 interval. Withdraw only this derived scalar; preserve original ETIM/prose and do not invent an unqualified95 maximum.';proof='rehau-max-temperature-correction-plan.json';
        }else{decision='approved-source-sign-repair';reason='Exact original signed ETIM feature, original cached manufacturer response and derived characteristic were independently compared. Only the missing leading sign is restored.';proof='catalog-repair-plan.json';}
      }else if(cone.has(f.sku)){
        decision='approved-separate-cone-context-repair';reason='Sealing-cone60° and branch/bend angle are distinct parameters. Separate approved source/PAV/public-display plan; not a blind ETIM numeric replacement.';proof='rehau-cone-correction-plan.json';
      }else if(numericBySku.has(f.sku)){
        decision='retain-reviewed-title-ETIM-context';reason=numericBySku.get(f.sku).reason;proof='base-review/imported-numeric-adjudications.json';
      }else if(preciseAngles.has(f.sku)){
        decision='retain-exact-87.5-degree-variant';reason='Exact manufacturer article title states87.5°, while coarse ETIM says87°. Preserve the precise variant; do not round it down.';proof='../../imports/rehau-semantic-regression.json';
      }else throw new Error('Unreviewed remaining ETIM disagreement: '+f.sku);
      break;
    case 'manufacturer-category-context':decision='approved-category-context-repair';reason='Exact manufacturer class and named engineering system determine the appropriate leaf.';proof='catalog-repair-plan.json';break;
    case 'typed-detail-not-configured-as-category-facet':decision='retain-valid-nonfilter-detail';reason='A stored technical attribute need not be a category filter. No removal or invented facet is proposed.';break;
    case 'manufacturer-source-conflict-current-supported':decision='retain-source-supported-multiple-contexts';reason='The current value is supported. The broad detector also found another connector, condition, size or table column; different values are not proof of a factual contradiction.';break;
    case 'source-url-preserved-in-nested-original-field':decision='retain-preserved-nested-source-url';reason='The original sourceUrl/link is preserved; an empty canonical URL field is not loss of the manufacturer evidence.';break;
    case 'missing-preserved-source-url':decision='unverified-item-url-gap';reason='Original item data remains present, but no manufacturer item-page URL is preserved. Image URLs are not accepted as item-page evidence.';break;
    case 'short-description-over-300':decision='editorial-length-only';reason='A length flag does not establish a technical error. No unreviewed prose rewrite is proposed.';break;
    case 'conflicting-manufacturer-numeric-facts':
      assert.match(f.id,/^altep-p16(?:-|$)/);assert.equal(f.attribute,'weightKg');
      decision='retain-flattened-table-column-ambiguity';reason='Original table rows contain adjacent model/coil masses, such as237161 separated by a space; treating them as one thousands-grouped scalar is not valid column selection. Keep the current value pending exact model-column adjudication.';break;
    case 'numeric-source-disagreement-needs-adjudication':
      if(f.id==='tekkhaus-1000124'){decision='approved-unit-conversion-repair';reason='Exact manufacturer source25000l/h is25m³/h, not25000m³/h.';proof='base-review/reviewed-corrections.json';}
      else if(f.id.startsWith('grundfos-')){decision='retain-operating-PN-vs-maximum-pressure';reason='PN10/current operating designation and25bar maximum are different source parameters, not interchangeable numbers.';proof='base-review/rejected-replacements.json';}
      else if(f.id==='tekkhaus-1000094'){decision='retain-conflicting-source-blocks';reason='Preserved source includes450W and600W alongside inconsistent flow/head blocks. No single scalar can safely override the current value.';}
      else throw new Error('Unreviewed numeric disagreement '+f.id);
      break;
    default:throw new Error('Unadjudicated detector kind: '+f.kind);
  }
  return {id:f.id,sku:f.sku,kind:f.kind,decision,reason,...(proof?{proof}:{}),...(f.evidence?.sourceUrl?{sourceUrl:f.evidence.sourceUrl}:{})};
});
const counts={};for(const d of decisions)counts[d.decision]=(counts[d.decision]||0)+1;
assert.equal(counts['approved-source-sign-repair'],381);assert.equal(counts['approved-upstream-MAX-conflict-withdrawal'],20);assert.equal(counts['approved-category-context-repair'],94);
assert.equal(counts['approved-separate-cone-context-repair'],3);assert.equal(counts['retain-exact-87.5-degree-variant'],4);
const sourceReview=read('imports/overnight-audit/source-reconciliation/summary.json'),baseReview=read('imports/overnight-audit/base-review/summary.json');
const identities=baseReview.covered+sourceReview.total+scope.coverage.rehauCurrentRecords;assert.equal(identities,19629);
const repairFiles=['imports/overnight-audit/catalog-repair-plan.json','imports/overnight-audit/rehau-cone-correction-plan.json',
  'imports/overnight-audit/source-reconciliation/correction-plan.json','imports/overnight-audit/rehau-max-temperature-correction-plan.json',
  'imports/overnight-audit/source-reconciliation/correction-claims-plan.json','imports/overnight-audit/source-reconciliation/correction-grammar-followup-plan.json'];
const uniqueProducts=new Set(),uniqueSources=new Set(),uniqueTyped=new Set(),uniqueFields=new Set();let deletedTyped=0,replacedTyped=0,categoryMoves=0;
const repairPlans=repairFiles.map(file=>{
  const p=read(file);for(const item of p.products){uniqueProducts.add(item.id);
    for(const c of item.sourceChanges)uniqueSources.add(c.sourceRecordId);
    for(const c of item.attributeChanges){uniqueTyped.add(item.id+':'+c.attributeId);if(c.action==='delete')deletedTyped++;else replacedTyped++;}
    for(const c of item.productChanges){uniqueFields.add(item.id+':'+c.field);if(c.field==='primary_category_id')categoryMoves++;}
  }return{file,jobId:p.jobId,sha256:hash(file),products:p.products.length,summary:p.summary};
});
const receiptFile='backups/overnight-2026-11-26/final-desired-audits.json';let hostedFinal=null;
if(fs.existsSync(path.join(root,receiptFile))){
 const receipts=read(receiptFile),results=receipts.flatMap(x=>x.rows.map(row=>row.result));assert.equal(results.length,3);
 for(const row of results){assert.equal(row.pass,true);assert.equal(row.violationCount,0);assert.equal(row.expectedProducts,row.actualExpectedIdentities);}
 const total=key=>results.reduce((n,row)=>n+row[key],0);assert.equal(total('actualExpectedIdentities'),1252);assert.equal(total('expectedSourceRecords'),999);assert.equal(total('expectedTypedRows'),32);
 hostedFinal={status:'PASS',receiptFile,receiptSha256:hash(receiptFile),parts:3,products:1252,sourceRecords:999,typedRows:32,violations:0};
}
const result={status:hostedFinal?'COMPLETE-SOURCE-AUDIT-AND-INTEGRATED-HOSTED-DESIRED-STATE-PASS':'COMPLETE-LOCAL-AUDIT-SOURCE-ADJUDICATION-NOT-A-HOSTED-COMPLETION-CLAIM',baseline:{products:19629,published:19327,attributes:49615,sources:19629,
  exportManifestSha256:audit.exportManifestSha256,productMd5Aggregate:audit.productMd5Aggregate},
  exhaustiveCoverage:{pages:197,productIdentities:identities,baseCatalog:baseReview.covered,otherImportedBrands:sourceReview.total,rehau:scope.coverage.rehauCurrentRecords,
    taxonomyCategories:audit.coverage.categories,attributeDefinitions:audit.coverage.attributeDefinitions,taxonomyStructuralIssues:audit.taxonomyIssues.length},
  comparableFacts:{numericPavSourceMatched:audit.coverage.typedSourceVerified,sourceEtimRowsExamined:audit.coverage.etimFacts,
    etimRepresentationMatched:audit.coverage.etimProjected,additionalIndependentBrandComparisons:sourceReview.comparisons,
    numericPublicQuantityTokensLocatedInPreservedSource:audit.coverage.descriptionSupported},
  detectorAdjudications:{total:decisions.length,counts},
  stagedPrimaryRepair:{jobId:plan.jobId,planSha256:hash('imports/overnight-audit/catalog-repair-plan.json'),...plan.summary},
  separateUpstreamMaximumAdjudication:{...read('imports/overnight-audit/rehau-max-temperature-correction-plan.json').summary,
    planSha256:hash('imports/overnight-audit/rehau-max-temperature-correction-plan.json'),originalSourcePreserved:true,unqualifiedReplacementMaximum:null},
  hostedFinalVerification:hostedFinal,
  repairPlanUnion:{expectedOnlyUntilHostedAudits: !hostedFinal,uniqueProducts:uniqueProducts.size,uniqueSourceRecords:uniqueSources.size,
    uniqueProductFields:uniqueFields.size,categoryMoves,uniqueTypedRows:uniqueTyped.size,deletedTyped,replacedTyped,
    expectedFinalTypedRows:49615-deletedTyped,repairPlans},
  originalExcludedTools:{total:266,retainedDraft:196,neverImported:70,additionalReviewedCable:1,expectedTotalAfterRepair:267,expectedRehauPublishedAfterRepair:7638},
  independentNumericReview:{initialImportedCases:numeric.cases,exactSkuPdfSupported:numeric.exactSkuPdfSupported,sourceConflictsRetained:numeric.titleEtimConflictsRetained,automaticOverrides:0},
  unresolvedEvidenceGaps:{itemPageUrlMissing:counts['unverified-item-url-gap'],rawQuantityClaimsNotLocated:audit.ambiguousGroups['public-quantity-not-located-in-preserved-original-text'],
    numericValuesWithoutResolvableIndependentScalar:audit.ambiguousGroups['numeric-source-not-independently-resolvable'],
    physicalPipeTypeUnknownForLength:audit.ambiguousGroups['pipe-length-physical-product-type-needs-review'],
    compoundOutletCodesNotSummed:audit.ambiguousGroups['compound-count-select-retained-without-summing'],
    note:'These are unsupported/ambiguous detector cases, not certified factual errors. Exact lists remain private in ambiguous-checks.json and base/source reconciliation artifacts.'},
  limitations:['The scan covers100% of current records, not a claim that every unstructured technical sentence was independently certified.',
    'Manufacturer source conflicts, variant/packaging ambiguities, absent source links and incomplete typed data remain explicit; no specification is invented.',
    'Commercial updates after the backup are excluded from technical guards. Frozen import batches and original manufacturer evidence are not regenerated.'],
  privateArtifacts:{fullDecisions:'detector-adjudications.json',scope:'rehau-scope-extension-review.json',primaryPlan:'catalog-repair-plan.json',conePlan:'rehau-cone-correction-plan.json',
    baseReview:'base-review/summary.json',brandReview:'source-reconciliation/summary.json'}};
fs.writeFileSync(path.join(out,'detector-adjudications.json'),JSON.stringify({count:decisions.length,decisions},null,2)+'\n');
fs.writeFileSync(path.join(out,'review-summary.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,coverage:result.exhaustiveCoverage,decisionCounts:counts,primaryRepair:result.stagedPrimaryRepair,hostedConnections:0}));
