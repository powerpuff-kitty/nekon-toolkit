"""Exercise the emitted binding adapter with a synthetic in-memory browser vault port.

The port is deliberately not encrypted and is not IndexedDB. Node composition
checks cover encryption using a separate test vault. This is no live enrollment.
"""
from __future__ import annotations
import argparse
import json
from importlib.metadata import version
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', type=Path, help='An already installed Chromium executable')
    args = parser.parse_args()
    if version('playwright') != '1.57.0':
        raise SystemExit('Use scripts/browser-requirements.txt (Playwright 1.57.0).')
    modules = {
        f'https://storage.test/{name}.js':
            (ROOT / f'packages/client-runtime/dist/{name}.js').read_text(encoding='utf-8')
        for name in ['application-enrollment-storage', 'application-enrollment-bound-vault',
                     'application-enrollment-validation']
    }
    modules['https://storage.test/sdk.js'] = (
        ROOT / 'packages/sdk/dist/application-enrollment-storage.js').read_text(encoding='utf-8')
    unexpected: list[str] = []
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **(
            {'executable_path': str(args.chromium.resolve(strict=True))} if args.chromium else {}
        ))
        context = browser.new_context(offline=True)

        def fulfill(route):
            if route.request.url not in modules:
                unexpected.append(route.request.url)
                route.abort()
                return
            route.fulfill(status=200, content_type='text/javascript',
                          headers={'Access-Control-Allow-Origin': '*'}, body=modules[route.request.url])

        context.route('**/*', fulfill)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.set_content('''<!doctype html><html lang="en"><title>Bound storage test</title>
              <script type="importmap">{"imports":{
                "@nekon/client-runtime/application-enrollment-storage":
                "https://storage.test/application-enrollment-storage.js"
              }}</script></html>''')
            checks = page.evaluate('''async () => {
              const sdk = await import('https://storage.test/sdk.js');
              const runtime = await import('https://storage.test/application-enrollment-storage.js');
              const open = sdk.openBoundApplicationEnrollmentVault;
              const checks = [];
              const assert = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
              const reject = async (promise, code) => {
                try { await promise; } catch (e) { if(e.message!==code) throw e; return; }
                throw new Error('Expected rejection: '+code);
              };
              const b64 = n => btoa(String.fromCharCode(0).repeat(n)).replace(/=+$/, '');
              const binding = Object.freeze({purpose:'browser-application-enrollment',serviceOrigin:'https://service.example',
                applicationId:'app_0123456789abcdef',redirectUri:'https://app.example/callback',
                targetIdentityId:'id_0123456789abcdef',targetDeviceId:'dev_0123456789abcdef',
                targetSigningKeyHash:b64(32),targetMlsCredentialHash:b64(32)});
              // TEST PORT ONLY. Persistence here is plaintext; the real host must encrypt and enforce CAS.
              const fixture = () => {
                let record=null; const seen={writes:0,reads:[],writeBuffers:[]};
                const vault={
                  async read(){if(!record)return null;const bytes=record.plaintext.slice();seen.reads.push(bytes);return{plaintext:bytes,revision:record.revision};},
                  async inspectRecord(){return record?{revision:record.revision,deleted:false}:null;},
                  async write(v){if((record?.revision??0)!==v.expectedRevision)throw new Error('test_cas_conflict');
                    seen.writeBuffers.push(v.plaintext);record={plaintext:v.plaintext.slice(),revision:v.expectedRevision+1};seen.writes++;return record.revision;}
                };
                return {vault,seen,seed:v=>{record={plaintext:new TextEncoder().encode(JSON.stringify(v)),revision:1};}};
              };
              const f=fixture();const options={vault:f.vault,binding,initializeNewVault:true,assertActive(){}};
              assert(open===runtime.openBoundApplicationEnrollmentVault,'SDK and runtime share the same binding function');
              const store=await open(options);
              assert(await store.read()===null&&f.seen.writes===1,'new vault receives its binding before any draft');
              assert(f.seen.writeBuffers.every(b=>b.every(v=>v===0)),'owned write buffers are cleared');
              const draft={status:'prepared',applicationId:binding.applicationId,authorizationRequestId:'ear_0123456789abcdef',
                redirectUri:binding.redirectUri,targetIdentityId:binding.targetIdentityId,targetDeviceId:binding.targetDeviceId,
                state:b64(24),codeVerifier:'A'.repeat(43),codeChallenge:b64(32),targetSigningKeyHash:b64(32),
                targetMlsCredentialHash:b64(32),targetMlsCredential:b64(1)};
              const first=await store.stage(draft);
              const reopened=await open({...options,initializeNewVault:false});
              assert(first.revision===2&&(await reopened.read()).authorizationRequestId===draft.authorizationRequestId,'same binding reopens the stored draft');
              const enrolled={status:'enrolled',applicationId:binding.applicationId,accountId:'acct_0123456789abcdef',
                targetIdentityId:binding.targetIdentityId,targetDeviceId:binding.targetDeviceId,authorizationRequestId:draft.authorizationRequestId,
                receipt:{enrolled:true,applicationId:binding.applicationId,authorizationRequestId:draft.authorizationRequestId,
                  accountId:'acct_0123456789abcdef',identityId:binding.targetIdentityId,deviceId:binding.targetDeviceId,duplicate:false}};
              const completed=await store.advance(enrolled,first.revision);
              const before=f.seen.writes;
              await reject(open({...options,binding:{...binding,serviceOrigin:'https://other.example'}}),'application_enrollment_binding_mismatch');
              assert(f.seen.writes===before,'completed enrollment refuses a different service without rewriting');
              await reject(open({...options,binding:{...binding,targetDeviceId:'dev_fedcba9876543210'}}),'application_enrollment_binding_mismatch');
              assert(f.seen.writes===before,'completed enrollment refuses a different device');
              await store.retire(completed.revision);
              assert(await store.read()===null,'retirement clears the draft');
              await reject(open({...options,binding:{...binding,redirectUri:'https://app.example/other'}}),'application_enrollment_binding_mismatch');
              assert(f.seen.writes===before+1,'retirement preserves the callback binding');
              await reject(store.stage({...draft,targetDeviceId:'dev_fedcba9876543210'}),'application_enrollment_binding_mismatch');
              assert(f.seen.writes===before+1,'cross-bound draft is rejected before writing');
              assert(f.seen.reads.every(b=>b.every(v=>v===0)),'decrypted-read buffers are cleared on success and mismatch');
              const legacy=fixture();legacy.seed({formatVersion:1,...draft});
              await reject(open({...options,vault:legacy.vault}),'application_enrollment_binding_legacy_unsupported');
              assert(legacy.seen.writes===0,'V1 is rejected without migration even with initializeNewVault');
              const empty=fixture();
              await reject(open({...options,vault:empty.vault,initializeNewVault:false}),'application_enrollment_binding_missing');
              assert(empty.seen.writes===0,'existing empty storage cannot be silently adopted');
              const malformed=fixture();malformed.seed({formatVersion:2,binding,draft:null,extra:true});
              await reject(open({...options,vault:malformed.vault}),'application_enrollment_binding_corrupt');
              assert(malformed.seen.reads.every(b=>b.every(v=>v===0)),'invalid envelopes are rejected and plaintext copies cleared');
              return checks;
            }''')
            assert not unexpected, 'Unexpected request outside the emitted-module allowlist'
            assert not errors, 'Unexpected page error'
            checks.append('four modules fulfilled in memory; no external request or page error')
            print(json.dumps({'passed': len(checks), 'browser': browser.version,
                              'playwright': version('playwright'),
                              'vault': 'synthetic plaintext port; NOT browser encryption/IndexedDB',
                              'checks': checks}, indent=2))
        finally:
            context.close()
            browser.close()


if __name__ == '__main__':
    main()
