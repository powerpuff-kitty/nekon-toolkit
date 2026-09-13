import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root));
const manifest=JSON.parse(await read('local-vault-extraction.json'));

test('local vault records its exact coordinated source and unavailable production KDF',()=>{
  assert.equal(manifest.sourceRepository,'powerpuff-kitty/nekon');
  assert.equal(manifest.sourceCommit,'c4f72babf0b8c84854c3185ceeed717c8bf1303d');
  assert.equal(manifest.publicationAllowed,false);assert.equal(manifest.productionKdfIncluded,false);
  assert.match(manifest.sourceStatus,/unmerged/);assert.match(manifest.ownership,/not migrated/);
  assert.deepEqual(manifest.runtimeDependencies,[]);assert.equal(manifest.files.length,1);
});
test('vault source matches the reviewed upstream blob and SHA-256',async()=>{
  const entry=manifest.files[0];assert.equal(entry.path,'packages/client-runtime/src/local-vault.ts');
  const bytes=await read(entry.path);assert.equal(entry.bytes,bytes.length);
  assert.equal(entry.gitBlob,'689533fe33ab8c1e83fe9fa5fc2a1b0b4919925f');
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),entry.gitBlob);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  assert.doesNotMatch(bytes.toString(),/^import\b/m);
});
for(const name of ['client-runtime','sdk']) {
  test(`${name} exposes the dedicated vault entry without publishing or adding dependencies`,async()=>{
    const pkg=JSON.parse(await read(`packages/${name}/package.json`));
    assert.deepEqual(pkg.exports['./local-vault'],{types:'./dist/local-vault.d.ts',import:'./dist/local-vault.js'});
    assert.equal(pkg.private,true);assert.equal(pkg.license,'UNLICENSED');assert.equal(pkg.exports['.'],undefined);
    assert.match(pkg.scripts.prepublishOnly,/Publication disabled/);
    assert.deepEqual(pkg.dependencies??{},name==='sdk'?{'@nekon/client-runtime':'0.1.0-extraction.0'}:{});
    const config=JSON.parse(await read(`packages/${name}/tsconfig.json`));
    assert.ok(config.include.includes('src/local-vault.ts'));assert.equal(config.compilerOptions.skipLibCheck,false);
  });
}
test('package verification retains earlier test groups and checks vault public composition',async()=>{
  const source=(await read('scripts/verify-application-event.mjs')).toString();
  for(const path of ['consumer.test.mjs','transport.test.mjs','lifecycle.cases.mjs','http-semantics.cases.mjs','authorization.test.mjs',
    'enrollment/consumer.test.mjs','enrollment-storage/consumer.test.mjs','enrollment-proof/consumer.test.mjs',
    'tests/developer-workbench/workbench.test.mjs','local-vault/consumer.test.mjs','local-vault/consumer.ts']) assert.ok(source.includes(`'${path}'`));
  assert.match(source,/if \(includeArgon2\) tests.push\('local-vault\/argon2.cases.mjs'\)/);
  assert.ok(source.includes("process.env.NEKON_VAULT_ARGON2_TESTS === '1'"));
  assert.match(source,/delete env.NEKON_TRANSPORT_TEST_MODULE/);
});
test('Argon2 reference is optional pinned test tooling, not an implementation fallback',async()=>{
  assert.match((await read('scripts/vault-test-requirements.txt')).toString(),/^argon2-cffi==25\.1\.0$/m);
  const tests=(await read('tests/local-vault/argon2.cases.mjs')).toString();
  assert.match(tests,/time_cost=3,memory_cost=65536,parallelism=1,hash_len=32,type=Type.ID,version=19/);
  const sdk=(await read('packages/sdk/src/local-vault.ts')).toString();
  assert.match(sdk,/from "@nekon\/client-runtime\/local-vault"/);
  assert.doesNotMatch(sdk,/spawnSync|deriveKey\s*[:=]/);
});

// The same event-level regressions are staged upstream; not native persistence evidence.
test('abort settlement cases are preserved and registered in installed vault consumers',async()=>{
  const bytes=await read('tests/local-vault/idb-settlement.cases.mjs');
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),'541c629a6524dec61e4eba1d82c43433f70ee037');
  const cases=(await read('tests/local-vault/consumer.test.mjs')).toString();
  assert.match(cases,/import \{ registerIdbSettlementCases \} from '\.\/idb-settlement\.cases\.mjs'/);
  assert.match(cases,/registerIdbSettlementCases\(test, \{ LocalSecretVault, IndexedDbVaultStorage \}\)/);
});

// Explicit connection events are regression evidence, not a native storage pass.
test('connection lifecycle cases and native follow-up remain registered',async()=>{
  const bytes=await read('tests/local-vault/idb-connection.cases.mjs');
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),'04cbc3a4cbedb23288c7dee87047c8a52369ba16');
  const consumer=(await read('tests/local-vault/consumer.test.mjs')).toString();
  assert.ok(consumer.includes("from './idb-connection.cases.mjs'"));
  assert.ok(consumer.includes('registerIdbConnectionCases(test, { IndexedDbVaultStorage })'));
  const browser=(await read('scripts/check-local-vault-browser.py')).toString();
  assert.ok(browser.includes("page.goto(origin + '/', timeout=10000)"));
  assert.ok(browser.includes('indexedDB.open(connectionDb,2)'));
  assert.ok(browser.includes('indexedDB.deleteDatabase(connectionDb)'));
  assert.doesNotMatch(browser,/set_content|route\.fulfill|disable-web-security|ignoreHTTPSErrors/);
});
