import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('enrollment-extraction.json',root),'utf8'));
const expected = {
  'application-enrollment-coordinator':'19a85f356fb4daa4c2c4121fe09bf71a5e90d6db',
  'application-enrollment-types':'0f25ddfb6e03bc13f61e38f22dd6affaa09800e8',
  'application-enrollment-validation':'5c223b74f7140e819c96418510a055b50fd44256',
};
const gitHash=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
test('enrollment source records the coordinated unmerged upstream without publication claims',()=>{
  assert.equal(manifest.sourceRepository,'powerpuff-kitty/nekon');
  assert.equal(manifest.sourceCommit,'ebad69147676cd905fc5bdb2572af3e42366cba6');
  assert.equal(manifest.publicationAllowed,false);assert.match(manifest.ownership,/not migrated/);
  assert.deepEqual(manifest.files.map(f=>f.path).sort(),Object.keys(expected).map(n=>`packages/client-runtime/src/${n}.ts`).sort());
});
for(const [name,sha] of Object.entries(expected)){
  test(`enrollment source equals upstream: ${name}`,async()=>{
    const path=`packages/client-runtime/src/${name}.ts`;const entry=manifest.files.find(f=>f.path===path);const bytes=await readFile(new URL(path,root));
    assert.equal(entry.gitBlob,sha);assert.equal(gitHash(bytes),sha);assert.equal(bytes.length,entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  });
}
test('test-only encrypted adapter is the unchanged upstream fixture',async()=>{
  const bytes=await readFile(new URL('tests/enrollment/enrollment-fixture.mjs',root));
  assert.equal(gitHash(bytes),'4213cbbbbb3ac21842f908ee21815818a111eaa6');
});
test('both canonical manifests expose only the intended new enrollment entry',async()=>{
  for(const leaf of ['client-runtime','sdk']){
    const pkg=JSON.parse(await readFile(new URL(`packages/${leaf}/package.json`,root),'utf8'));
    assert.equal(pkg.private,true);assert.equal(pkg.license,'UNLICENSED');
    assert.deepEqual(pkg.exports['./application-enrollment'],{types:'./dist/application-enrollment.d.ts',import:'./dist/application-enrollment.js'});
    assert.equal(pkg.exports['./application-enrollment-validation'],undefined);
    assert.equal(pkg.exports['./application-enrollment-coordinator'],undefined);
  }
});
