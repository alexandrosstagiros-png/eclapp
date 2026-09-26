'use strict';
// Explicit local administrative import; source content is data, never commands.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { paths, ORIGIN, readJson, atomicJson } = require('../local-app/runtime.cjs');
const { articleImportInput } = require('../../recovered/apps/api/src/modules/team/team-knowledge-input');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function localFetch(url, options = {}) {
  for (let attempt=0;attempt<5;attempt++) {
    // Fresh timeout on each retry. A 429 never executes the mutation, and
    // stable import IDs also make repeated accepted imports idempotent.
    const response = await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
    if(response.status!==429 || attempt===4)return response;
    const retry=response.headers.get('retry-after');
    const seconds=Number(retry), until=Date.parse(retry || '');
    const waitMs=Math.min(5*60000,Math.max(1000,Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(until)?until-Date.now():60000))+250;
    await response.arrayBuffer();
    console.log(JSON.stringify({status:'rate_limited',retryInSeconds:Math.ceil(waitMs/1000)}));
    for(let remaining=waitMs;remaining>0;remaining-=30000)await delay(Math.min(30000,remaining));
  }
}

async function prepare(manifestPath, targetsPath) {
  const manifest = await readJson(manifestPath), targets = await readJson(targetsPath);
  assert.equal(manifest.schemaVersion,1);assert.ok(Array.isArray(manifest.documents) && manifest.documents.length > 0 && manifest.documents.length <= 1000);
  assert.equal(manifest.summary?.readyForImport,true,'Document extraction needs review before import');
  assert.equal(targets.schemaVersion,1);assert.ok(['scope','staff','admin'].includes(targets.visibility));
  const originals = await fs.realpath(path.join(path.dirname(manifestPath),'originals'));
  const seen = new Set(), records = [];
  for(const document of manifest.documents) {
    assert.equal(typeof document.sourcePath,'string');assert.ok(!seen.has(document.sourcePath),'Duplicate source path');seen.add(document.sourcePath);
    assert.equal(path.posix.dirname(document.sourcePath),document.folderPath);
    assert.equal(path.posix.basename(document.sourcePath),document.filename);
    assert.ok(typeof document.title==='string' && document.title.length<=200 && document.title.trim());
    assert.ok(typeof document.body==='string' && document.body.length<=60000 && document.body.trim(),'Article body exceeds limit or is empty');
    const original = await fs.realpath(path.resolve(path.dirname(manifestPath),document.originalPath));
    assert.ok(original.startsWith(originals+path.sep),'Original must belong to prepared originals directory');
    const info = await fs.stat(original);assert.ok(info.isFile() && info.size<=8*1024*1024);
    const bytes = await fs.readFile(original);assert.equal(bytes.length,document.byteSize);assert.equal(sha256(bytes),document.sha256);
    const rootFolder=document.sourcePath.split('/')[0];
    const scopeIds=targets.folderScopeIds?.[rootFolder] ?? targets.defaultScopeIds;
    assert.ok(Array.isArray(scopeIds) && scopeIds.length>0 && scopeIds.length<=100 && scopeIds.every(id=>UUID.test(id)));
    assert.equal(new Set(scopeIds).size,scopeIds.length);
    records.push({document,bytes,payload:{responsibilityScopeIds:scopeIds,visibility:targets.visibility,sourcePath:document.sourcePath,folderPath:document.folderPath,title:document.title,body:document.body,sourceArchive:document.sourceArchive,file:{filename:document.filename,mimeType:document.mimeType,contentBase64:bytes.toString('base64')}}});
  }
  // Validate the whole batch against the same contract before the first write.
  for (const record of records) articleImportInput(record.payload);
  return {manifest,targets,records,summary:{documents:records.length,articles:records.reduce((sum,r)=>sum+r.payload.responsibilityScopeIds.length,0),originalBytes:records.reduce((sum,r)=>sum+r.bytes.length,0),folders:[...new Set(records.map(r=>r.document.sourcePath.split('/')[0]))],visibility:targets.visibility}};
}

async function applyLocal(prepared, reportPath) {
  const login = await readJson(paths.login);
  const auth = await localFetch(ORIGIN+'/api/v1/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:login.phone,password:login.password,rememberDevice:false}),signal:AbortSignal.timeout(10000)});
  assert.equal(auth.status,200,'Local administrator login failed');
  const session=await auth.json(), headers={Authorization:`Bearer ${session.accessToken}`};
  const report={startedAt:new Date().toISOString(),sourceManifestSha256:sha256(JSON.stringify(prepared.manifest)),targets:prepared.targets,summary:prepared.summary,createdCount:0,unchangedCount:0,records:[],remoteServerUpdated:false};
  try {
    const contextResponse=await localFetch(ORIGIN+'/api/v1/team/context',{headers});assert.equal(contextResponse.status,200);
    const context=await contextResponse.json();assert.equal(context.canManage,true);
    const grants=new Set(context.scopes.map(scope=>scope.responsibilityScopeId));
    for(const record of prepared.records) for(const scopeId of record.payload.responsibilityScopeIds) assert.ok(grants.has(scopeId),'Missing target scope grant');
    for(const record of prepared.records) {
      const response=await localFetch(ORIGIN+'/api/v1/team/articles/import',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(record.payload),signal:AbortSignal.timeout(30000)});
      if(!response.ok) throw new Error(`Import failed for ${record.document.sourcePath}: HTTP ${response.status}`);
      const result=await response.json();
      assert.equal(result.createdCount+result.unchangedCount,record.payload.responsibilityScopeIds.length);
      report.createdCount+=result.createdCount;report.unchangedCount+=result.unchangedCount;
      const imported={sourcePath:record.document.sourcePath,sha256:record.document.sha256,articles:result.articles.map(a=>({id:a.id,responsibilityScopeId:a.responsibilityScopeId}))};
      report.records.push(imported);
      await atomicJson(reportPath,report);
      if(report.records.length%10===0) console.log(JSON.stringify({processed:report.records.length,total:prepared.records.length}));
    }
    // Every article is checked in its real scope, and each original is downloaded
    // once and compared byte-for-byte, without logging source text or credentials.
    const scopeIds=[...new Set(report.records.flatMap(record=>record.articles.map(article=>article.responsibilityScopeId)))];
    const listed=new Map();
    for(const scopeId of scopeIds) {
      const r=await localFetch(`${ORIGIN}/api/v1/team/articles?responsibilityScopeId=${scopeId}`,{headers});assert.equal(r.status,200);
      listed.set(scopeId,new Map((await r.json()).articles.map(article=>[article.id,article])));
    }
    for(const [index,record] of report.records.entries()) {
      const expected=prepared.records[index].document;
      for(const location of record.articles) {
        const article=listed.get(location.responsibilityScopeId).get(location.id);assert.ok(article);
        assert.equal(article.sourceFile.sha256,record.sha256);assert.equal(article.sourceFile.filename,expected.filename);assert.equal(article.folderPath,expected.folderPath);assert.equal(article.visibility,prepared.targets.visibility);
      }
      const first=record.articles[0];
      const response=await localFetch(`${ORIGIN}/api/v1/team/articles/${first.id}/source?responsibilityScopeId=${first.responsibilityScopeId}`,{headers,signal:AbortSignal.timeout(10000)});
      assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),prepared.records[index].bytes);
    }
    report.completedAt=new Date().toISOString();report.verifiedOriginals=report.records.length;report.verifiedArticles=report.summary.articles;
    await atomicJson(reportPath,report);
    return report;
  } finally { await localFetch(ORIGIN+'/api/v1/auth/logout',{method:'POST',headers}); }
}

if(require.main===module) {
  (async()=>{
    const args=process.argv.slice(2), value=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];};
    assert.ok(value('--manifest') && value('--targets'),'Required: --manifest path --targets path [--apply]');
    const manifestPath=path.resolve(value('--manifest')), prepared=await prepare(manifestPath,path.resolve(value('--targets')));
    console.log(JSON.stringify({mode:args.includes('--apply')?'apply':'dry-run',...prepared.summary}));
    if(args.includes('--apply')) {
      const report=await applyLocal(prepared,path.join(path.dirname(manifestPath),'import-report.json'));
      console.log(JSON.stringify({created:report.createdCount,unchanged:report.unchangedCount,verifiedOriginals:report.verifiedOriginals,verifiedArticles:report.verifiedArticles}));
    }
  })().catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={prepare,applyLocal};
