import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, access, symlink, cp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateCatalog, sourcePath, readWithin, checkInventory, collectPortal, renderPortal, buildPortal, referenceId } from '../scripts/docs-portal.mjs';

const realCatalog = JSON.parse(await readFile(new URL('../docs/portal/catalog.json',import.meta.url),'utf8'));
const fresh = () => structuredClone(realCatalog);
test('maintained catalog has a valid strict schema and unique documented entry points',()=>assert.equal(validateCatalog(realCatalog),realCatalog));
for (const [label, mutate] of [
  ['unknown catalog field',c=>c.rawHtml=true],
  ['unsupported version',c=>c.schemaVersion=2],
  ['missing start page',c=>c.pages[0].id='another'],
  ['duplicate guides',c=>c.pages.push(c.pages[0])],
  ['duplicate modules',c=>c.modules.push(c.modules[0])],
  ['empty safety boundary',c=>c.modules[0].boundary=''],
  ['external link',c=>c.pages[0].blocks.push({kind:'link',target:'https://example.invalid/',text:'Open'})],
  ['missing guide',c=>c.pages[0].blocks.push({kind:'link',target:'not-present',text:'Open'})],
  ['raw HTML block',c=>c.pages[0].blocks.push({kind:'html',text:'<script>alert(1)</script>'})],
  ['missing example',c=>c.pages[0].blocks.push({kind:'example',id:'missing'})],
  ['invalid example mode',c=>c.examples[0].mode='eval'],
  ['remote example',c=>c.examples[0].path='https://example.invalid/snippet.mjs'],
  ['escaping example',c=>c.examples[0].path='../secret.mjs'],
  ['undefined identifier',c=>c.examples[0].id=undefined],
  ['unreferenced example',c=>c.examples.push({...c.examples[0],id:'orphan'})],
  ['arbitrary error source',c=>c.errors[0].module='examples/untrusted.js'],
  ['undefined error code',c=>c.errors[0].code=undefined],
  ['too many pages',c=>c.pages=Array(101).fill(c.pages[0])],
]) {
  test(`authoring fails closed: ${label}`,()=>{const c=fresh();mutate(c);assert.throws(()=>validateCatalog(c));});
}
for (const path of ['../secret','/tmp/x','a/../b','a//b','https://host/x','a\\b','%2e%2e/a','a\0b','./file']) {
  test(`source paths cannot escape or request remote content: ${JSON.stringify(path)}`,()=>assert.throws(()=>sourcePath(path)));
}
test('public export inventory rejects new undocumented exports and stale documented exports',()=>{
 const c={modules:[{specifier:'@nekon/sdk/event'}]};
 assert.doesNotThrow(()=>checkInventory(c,[{specifier:'@nekon/sdk/event'}]));
 assert.throws(()=>checkInventory(c,[]),/public_exports_drift/);
 assert.throws(()=>checkInventory(c,[{specifier:'@nekon/sdk/event'},{specifier:'@nekon/sdk/new'}]),/public_exports_drift/);
});
test('reference identifiers are stable local fragment identifiers',()=>assert.equal(referenceId('@nekon/sdk/application-event'),'ref-nekon-sdk-application-event'));

/** Synthetic compiler-output fixtures test the generator; actual contracts are checked by the package lane. */
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'nekon-docs-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const write=async(path,text)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text);};
  const module={specifier:'@nekon/sdk/application-event',summary:'Synthetic module',boundary:'Not production',environment:'Node',credentials:'None'};
  const catalog={schemaVersion:1,snapshot:'2026-09-12',title:'Test docs',packages:['sdk'],modules:[module],
    examples:[{id:'demo',title:'Demo',path:'examples/demo/example.mjs',mode:'execute',environment:'Node',credentials:'None',testPath:'scripts/gate.mjs'}],
    pages:[{id:'start',title:'Start',summary:'Fixture',blocks:[{kind:'paragraph',text:'Safe text'},{kind:'example',id:'demo'},{kind:'errors'}]}],
    errors:[{code:'synthetic_error',module:'packages/client-runtime/dist/check.js',guidance:'Stop'}]};
  const save=()=>write('docs/portal/catalog.json',JSON.stringify(catalog));
  await save();
  await write('package.json','{"type":"module","private":true}');
  await write('packages/sdk/package.json',JSON.stringify({name:'@nekon/sdk',version:'0.1.0-test',private:true,license:'UNLICENSED',exports:{'./application-event':{import:'./dist/example.js',types:'./dist/example.d.ts'}}}));
  await write('packages/sdk/dist/example.js','export const hello = () => "hi";');
  await write('packages/sdk/dist/example.d.ts','export interface Greeting { readonly text: string; }\nexport declare function hello(): Greeting;\n');
  await write('packages/client-runtime/dist/check.js','throw new Error("synthetic_error");');
  await write('packages/tokens/dist/scoped.css',':root { --demo: 1; }');
  await write('docs/portal/style.css','body { margin:0; }');
  await write('docs/portal/app.js','/* safe fixture */');
  await write('examples/demo/example.mjs','// <script> is inert example text\nexport const text = "<img src=x onerror=alert(1)>";');
  await write('scripts/gate.mjs','// Test fixture, not a production execution gate');
  await cp(new URL('../scripts/docs-portal.mjs',import.meta.url),join(root,'scripts/docs-portal.mjs'));
  return {root,write,catalog,save};
}
test('generator resolves declarations with the real pinned compiler without executing module bodies',async t=>{
 const f=await fixture(t);const model=await collectPortal(f.root);
 assert.deepEqual(model.modules[0].symbols.map(s=>s.name),['Greeting','hello']);
 assert.match(model.modules[0].symbols[1].declarations[0].declaration,/hello\(\): Greeting/);
 assert.equal(model.publicationAllowed,false);
 assert.equal(model.compiler,'5.8.3');
});
test('SDK type/value re-exports resolve to the maintained runtime declarations',async t=>{
 const f=await fixture(t);
 const runtime={...f.catalog.modules[0],specifier:'@nekon/client-runtime/example'};
 f.catalog.packages.push('client-runtime');f.catalog.modules.push(runtime);await f.save();
 await f.write('packages/client-runtime/package.json',JSON.stringify({name:'@nekon/client-runtime',version:'test',private:true,license:'UNLICENSED',exports:{'./example':{types:'./dist/example.d.ts',import:'./dist/example.js'}}}));
 await f.write('packages/client-runtime/dist/example.js','export const hello = () => "hi";');
 await f.write('packages/client-runtime/dist/example.d.ts','export interface Greeting { readonly text: string; }\nexport declare function hello(): Greeting;');
 await f.write('packages/sdk/dist/example.d.ts','export { hello, type Greeting } from "@nekon/client-runtime/example";');
 const model=await collectPortal(f.root);
 assert.deepEqual(model.modules[0].symbols.map(s=>s.name),['Greeting','hello']);
 assert.equal(model.modules[0].symbols[0].declarations[0].source,'packages/client-runtime/dist/example.d.ts');
});
test('unresolved or ill-typed declaration contracts block docs output',async t=>{
 const f=await fixture(t);await f.write('packages/sdk/dist/example.d.ts','export declare function broken(): MissingType;');
 await assert.rejects(collectPortal(f.root),/invalid_declarations/);
});
test('missing error literals fail instead of publishing stale recovery advice',async t=>{
 const f=await fixture(t);f.catalog.errors[0].code='removed_error';await f.save();
 await assert.rejects(collectPortal(f.root),/documented_error_missing/);
});
test('error names in comments do not masquerade as implementation literals',async t=>{
 const f=await fixture(t);await f.write('packages/client-runtime/dist/check.js','// "synthetic_error" is no longer thrown\n');
 await assert.rejects(collectPortal(f.root),/documented_error_missing/);
});
test('publication-status change requires docs review',async t=>{
 const f=await fixture(t);const p=JSON.parse(await readFile(join(f.root,'packages/sdk/package.json'),'utf8'));p.private=false;
 await f.write('packages/sdk/package.json',JSON.stringify(p));await assert.rejects(collectPortal(f.root),/release_status_requires_review/);
});
test('symlink escaping the input root is rejected before reading data',async t=>{
 const f=await fixture(t);const outside=await mkdtemp(join(tmpdir(),'nekon-docs-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));
 await writeFile(join(outside,'secret'),'not repository input');await symlink(join(outside,'secret'),join(f.root,'escape'));
 await assert.rejects(readWithin(f.root,'escape'),/source_escapes_root/);
});
test('reference and example content is escaped, never interpreted as HTML',async t=>{
 const f=await fixture(t);f.catalog.pages[0].title='<img src=x>';f.catalog.pages[0].blocks[0].text='<script>unsafe</script>';await f.save();
 const model=await collectPortal(f.root);const html=renderPortal(model);
 assert.ok(html.includes('&lt;img src=x&gt;'));assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
 assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<script>unsafe'));
});
test('inline asset closing tags cannot escape the hashed element',async t=>{
 const f=await fixture(t);const model=await collectPortal(f.root);
 assert.throws(()=>renderPortal({...model,app:'</script><script>evil()</script>'}),/closing_element/);
 assert.throws(()=>renderPortal({...model,style:'</style><script>evil()</script>'}),/closing_element/);
});
test('CSP hashes bind actual inline styles/scripts and prohibit connection capabilities',async t=>{
 const f=await fixture(t);const model=await collectPortal(f.root);const html=renderPortal(model);
 for(const body of [model.app,model.style]) assert.ok(html.includes('sha256-'+createHash('sha256').update(body).digest('base64')));
 for(const capability of ['connect-src','font-src','frame-src','worker-src','form-action']) assert.ok(html.includes(`${capability} &#39;none&#39;`));
 assert.ok(!html.includes('unsafe-inline'));
});
test('identical inputs produce deterministic HTML/JSON; changed source changes the fingerprint',async t=>{
 const f=await fixture(t);const first=await buildPortal(f.root);const before=await readFile(join(f.root,'docs/portal/dist/index.html'));
 assert.deepEqual(await buildPortal(f.root),first);assert.deepEqual(await readFile(join(f.root,'docs/portal/dist/index.html')),before);
 await f.write('examples/demo/example.mjs','// changed maintained example');const next=await buildPortal(f.root);
 assert.notEqual(next.fingerprint,first.fingerprint);
});
for(const mode of ['catalog','declarations','missing-example']) {
 test(`failed rebuild removes stale and partial docs: ${mode}`,async t=>{
   const f=await fixture(t);await f.write('docs/portal/dist/index.html','stale');await f.write('docs/portal/dist/api.json.tmp','partial');
   if(mode==='catalog') await f.write('docs/portal/catalog.json','bad-json');
   if(mode==='declarations') await f.write('packages/sdk/dist/example.d.ts','export const wrong: NotDefined;');
   if(mode==='missing-example') await rm(join(f.root,'examples/demo/example.mjs'));
   await assert.rejects(buildPortal(f.root));await assert.rejects(access(join(f.root,'docs/portal/dist')));
 });
}
test('unknown command-line options reject before the docs build',()=>{
 const result=spawnSync(process.execPath,[new URL('../scripts/build-docs-portal.mjs',import.meta.url).pathname,'--skip-validation'],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,1);assert.match(result.stderr,/Usage:/);assert.equal(result.stdout,'');
});

test('the canonical verifier executes docs checks and compares installed/local artifacts',async()=>{
 const gate=await readFile(new URL('../scripts/verify-application-event.mjs',import.meta.url),'utf8');
 for(const required of ["'scripts/build-docs-portal.mjs'", "'tests/docs/consumer.cases.mjs'", "['index.html', 'api.json']",
   'Docs artifact ${artifact} differs between installed and local packages', 'node_modules/@nekon/${leaf}']) assert.ok(gate.includes(required),required);
 assert.ok(gate.includes("delete env.NEKON_TRANSPORT_TEST_MODULE;"));
});
test('documentation commands preserve existing full checks, runtime packages and compiler pin',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(pkg.scripts['build:docs'],'node packages/tokens/scripts/build.mjs && node scripts/build-application-event.mjs && node scripts/build-docs-portal.mjs');
 assert.equal(pkg.scripts['check:docs'],'node --test tests/docs-portal.test.mjs && node scripts/verify-application-event.mjs');
 assert.equal(pkg.scripts.check,'node scripts/verify.mjs && node scripts/verify-application-event.mjs');
 assert.deepEqual(pkg.devDependencies,{typescript:'5.8.3'});assert.equal(pkg.private,true);
});
test('documented examples remain registered for execution or type checking in the real gate',async()=>{
 const gate=await readFile(new URL('../scripts/verify-application-event.mjs',import.meta.url),'utf8');
 for(const example of realCatalog.examples) {
  assert.equal(example.testPath,'scripts/verify-application-event.mjs');
  if(example.mode==='execute') {
   const destination=example.id==='event-round-trip'?'example.mjs':'authorization-example.mjs';
   assert.ok(gate.includes(`['${example.path}', '${destination}']`));
   assert.ok(gate.includes("for (const example of ['example.mjs', 'authorization-example.mjs'])"));
  } else {
   assert.ok(['tests/enrollment/composition.ts','tests/local-vault/composition.ts'].includes(example.path));
   assert.ok(gate.includes(`'${example.path.slice('tests/'.length)}'`));
  }
 }
});
