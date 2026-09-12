/** Runs after docs generation inside the canonical installed-package consumer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,root));
const model=JSON.parse(await read('docs/portal/dist/api.json'));
const html=(await read('docs/portal/dist/index.html')).toString();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('docs inventory exactly covers current manifest exports, with real package versions',async()=>{
 const specs=[];
 for(const leaf of ['tokens','client-runtime','sdk']) {
  const pkg=JSON.parse(await read(`packages/${leaf}/package.json`));
  for(const key of Object.keys(pkg.exports)) {
   const spec=pkg.name+(key==='.'?'':key.slice(1));specs.push(spec);
   const entry=model.modules.find(m=>m.specifier===spec);assert.ok(entry);assert.equal(entry.version,pkg.version);
  }
 }
 assert.deepEqual(model.modules.map(m=>m.specifier).sort(),specs.sort());assert.equal(model.publicationAllowed,false);
});
test('runtime exports in the actual installed packages all have generated reference symbols',async()=>{
 for(const entry of model.modules.filter(m=>m.package!=='@nekon/tokens')) {
  const publicApi=await import(entry.specifier);
  for(const name of Object.keys(publicApi)) assert.ok(entry.symbols.some(s=>s.name===name),`${entry.specifier}: ${name}`);
 }
});
test('examples are exactly the maintained executable/typecheck sources, not copied prose',async()=>{
 assert.equal(model.examples.length,3);
 for(const example of model.examples) {const bytes=await read(example.path);assert.equal(example.source,bytes.toString());assert.equal(example.sha256,hash(bytes));}
 assert.equal(model.examples.filter(e=>e.mode==='execute').length,2);
 assert.equal(model.examples.filter(e=>e.mode==='typecheck').length,1);
});
test('fingerprint accounts for the exact input bytes used by the build',async()=>{
 for(const [path,digest] of Object.entries(model.inputs)) assert.equal(hash(await read(path)),digest,path);
 assert.equal(hash(Buffer.from(JSON.stringify(model.inputs))),model.fingerprint);
});
test('every documentation fragment link resolves to one unique local target',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]),match[1]);
 assert.equal([...html.matchAll(/\bdata-page\s/g)].length,25);
});
test('artifact is self-contained without remote scripts, CSS, font files or embedded frames',()=>{
 assert.equal([...html.matchAll(/<script/g)].length,1);assert.equal([...html.matchAll(/<style>/g)].length,1);
 assert.doesNotMatch(html,/<(?:iframe|img|link)\b|<script\b[^>]*\bsrc=/i);
 for(const element of ['script','style']) {
  const body=new RegExp(`<${element}>([\\s\\S]*?)<\\/${element}>`).exec(html)[1];
  assert.ok(html.includes('sha256-'+createHash('sha256').update(body).digest('base64')));
 }
});
test('guides preserve explicit release, credential and missing-adapter boundaries',()=>{
 for(const word of ['UNPUBLISHED SOURCE PREVIEW','COMPILE-ONLY CONTRACT','Credentials','Proposed V2','No account. No Cloud connection.']) assert.ok(html.includes(word),word);
 assert.ok(model.modules.every(m=>m.boundary&&m.credentials&&m.environment));
 assert.ok(model.errors.length>0);
});
test('HTML and machine-readable references stay within documented local budgets',async()=>{
 assert.ok(Buffer.byteLength(html)<=2*1024*1024);assert.ok((await read('docs/portal/dist/api.json')).byteLength<=2*1024*1024);
});
