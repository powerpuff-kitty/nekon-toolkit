import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const mode of ['wrong-version','compiler-failure','success']) {
  test(`build output cleanup: ${mode}`,async t=>{
    const root=await mkdtemp(join(tmpdir(),'nekon-build-test-'));
    t.after(()=>rm(root,{recursive:true,force:true}));
    for (const path of ['scripts','node_modules/typescript/bin','packages/client-runtime/dist','packages/sdk/dist']) {
      await mkdir(join(root,path),{recursive:true});
    }
    await cp(new URL('../scripts/build-application-event.mjs',import.meta.url),join(root,'scripts/build-application-event.mjs'));
    await writeFile(join(root,'node_modules/typescript/package.json'),'{"type":"commonjs"}');
    for (const leaf of ['client-runtime','sdk']) await writeFile(join(root,`packages/${leaf}/dist/stale.js`),'stale');
    // This fake compiler tests orchestration only; real compiler/output/type checks
    // remain in the installed-package lane and are not replaced by these cases.
    await writeFile(join(root,'node_modules/typescript/bin/tsc'),`
const fs=require('node:fs');
if (process.argv.includes('--version')) {
  console.log(${JSON.stringify(mode==='wrong-version'?'Version 0.0.0':'Version 5.8.3')});
} else {
  const leaf=process.argv.at(-1).includes('client-runtime')?'client-runtime':'sdk';
  fs.mkdirSync('packages/'+leaf+'/dist',{recursive:true});
  fs.writeFileSync('packages/'+leaf+'/dist/new.js','generated');
  ${mode==='compiler-failure'?'process.exitCode=1;':''}
}
`);
    const result=spawnSync(process.execPath,['scripts/build-application-event.mjs'],{cwd:root,encoding:'utf8',timeout:10000});
    assert.equal(result.error,undefined);
    assert.equal(result.status,mode==='success'?0:1);
    for (const leaf of ['client-runtime','sdk']) {
      await assert.rejects(access(join(root,`packages/${leaf}/dist/stale.js`)));
      if(mode==='success') await access(join(root,`packages/${leaf}/dist/new.js`));
      else await assert.rejects(access(join(root,`packages/${leaf}/dist`)));
    }
  });
}
