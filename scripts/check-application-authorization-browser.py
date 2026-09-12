"""Exercise built authorization/transport modules in Chromium using synthetic adapters only."""
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
        raise SystemExit('Use the pinned scripts/browser-requirements.txt environment.')
    modules = {
        f'https://authorization.test/{name}.js':
            (ROOT / f'packages/client-runtime/dist/{name}.js').read_text(encoding='utf-8')
        for name in ['application-device-authorization-api-resource', 'client-binary-codec',
                     'client-api-error', 'client-response-validation', 'client-transport', 'bounded-response']
    }
    modules['https://authorization.test/sdk.js'] = (
        ROOT / 'packages/sdk/dist/application-authorization.js').read_text(encoding='utf-8')
    unexpected: list[str] = []
    errors: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, **(
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
            page.set_content('''<!doctype html><html lang="en"><title>Authorization API test</title>
              <script type="importmap">{"imports":{
                "@nekon/client-runtime/application-authorization":
                "https://authorization.test/application-device-authorization-api-resource.js"
              }}</script></html>''')
            checks = page.evaluate('''async () => {
              const { ApplicationDeviceAuthorizationApiResource: Resource } = await import('https://authorization.test/sdk.js');
              const runtime = await import('https://authorization.test/application-device-authorization-api-resource.js');
              const { NekonTransport } = await import('https://authorization.test/client-transport.js');
              const checks = [];
              const assert = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
              const reject = async p => { try { await p; } catch(e) { return e; } throw new Error('Expected rejection'); };
              assert(Resource === runtime.ApplicationDeviceAuthorizationApiResource, 'SDK re-exports the exact runtime class');
              const b64 = n => btoa(String.fromCharCode(0).repeat(n)).replace(/=+$/, '');
              const app = 'app_SYNTHETICAPP00000';
              const request = Object.freeze({authorizationRequestId:'ear_SYNTHETICREQUEST0',
                redirectUri:'https://app.example.invalid/callback',state:b64(24),codeChallenge:b64(32),
                targetIdentityId:'id_SYNTHETICIDENTITY0',targetDeviceId:'dev_SYNTHETICDEVICE00',
                targetSigningKeyHash:b64(32),targetMlsCredentialHash:b64(32)});
              const proof = Object.freeze({authorizationRequestId:request.authorizationRequestId,code:b64(32),
                codeVerifier:'a'.repeat(43),targetSigningPublicKey:b64(32),targetMlsCredential:b64(1),targetSignature:b64(64)});
              const calls = [];
              const creation = {authorizationRequestId:request.authorizationRequestId,
                authorizationUrl:'https://service.example.invalid/approve',expiresAt:123456,duplicate:false};
              const enrolled = {enrolled:true,applicationId:app,authorizationRequestId:request.authorizationRequestId,
                accountId:'acct_SYNTHETICACCOUNT',identityId:request.targetIdentityId,deviceId:request.targetDeviceId,duplicate:true};
              let reply = () => Response.json(creation);
              const transport = new NekonTransport('https://service.example.invalid', {requestTimeoutMs:0,
                fetch:async(url,init)=>{calls.push({url,init});return reply();}});
              transport.setApplicationSession(request.targetDeviceId+'.'+b64(32));
              const api = new Resource(transport);
              const created = await api.createEnterpriseAuthorizationRequest(app, request);
              assert(created.authorizationRequestId===request.authorizationRequestId && calls.length===1,
                'creation correlates the receipt and submits once');
              assert(calls[0].init.credentials==='omit' && calls[0].init.redirect==='error' &&
                !calls[0].init.headers.has('Nekon-Application-Session'), 'stored application session is not sent by the public resource');
              assert(JSON.stringify(JSON.parse(calls[0].init.body))===JSON.stringify(request), 'creation preserves prepared wire material');
              reply = () => Response.json(enrolled);
              const receipt = await api.redeemEnterpriseAuthorization(app, proof);
              assert(receipt.duplicate===true && calls.length===2 &&
                calls[1].url.pathname.endsWith('/authorization-codes/redeem'), 'redemption preserves duplicate status with one submission');
              assert(JSON.stringify(JSON.parse(calls[1].init.body))===JSON.stringify(proof), 'redemption preserves prepared proof material');
              const before = calls.length;
              const invalid = await reject(api.createEnterpriseAuthorizationRequest(app,{...request,redirectUri:'https://secret@example.invalid/'}));
              assert(invalid.message==='invalid_enterprise_authorization_request'&&calls.length===before,
                'credential-bearing callback is rejected before dispatch');
              const wrongBytes = await reject(api.createEnterpriseAuthorizationRequest(app,{...request,state:b64(23)}));
              assert(wrongBytes.message==='invalid_enterprise_authorization_request'&&calls.length===before,
                'invalid state byte length is rejected before dispatch');
              reply = () => Response.json({...enrolled,applicationId:'app_DIFFERENT'});
              const mismatch = await reject(api.redeemEnterpriseAuthorization(app,proof));
              assert(mismatch.message==='invalid_enterprise_authorization_redemption_receipt','mismatched application receipt is rejected');
              reply = () => Response.json({...creation,extra:true});
              const extra = await reject(api.createEnterpriseAuthorizationRequest(app,request));
              assert(extra.message==='invalid_enterprise_authorization_request_receipt','unexpected receipt fields are rejected');
              reply = () => Response.json({error:'rate_limited'},{status:429,headers:{'Retry-After':'5'}});
              const limited = await reject(api.redeemEnterpriseAuthorization(app,proof));
              assert(limited.status===429&&limited.code==='rate_limited'&&limited.retryAfterSeconds===5,
                'HTTP status and bounded retry hint survive normalization');
              reply = () => new Response('<synthetic-secret>',{status:503});
              const failed = await reject(api.createEnterpriseAuthorizationRequest(app,request));
              assert(failed.code==='request_failed'&&!failed.message.includes('synthetic-secret'),
                'unstructured error content is not echoed');
              const cause = new Error('synthetic connection loss');
              reply = () => {throw cause;}; const count = calls.length;
              assert(await reject(api.redeemEnterpriseAuthorization(app,proof))===cause&&calls.length===count+1,
                'ambiguous connection failure does not trigger a second submission');
              return checks;
            }''')
            assert not unexpected, 'Unexpected request outside the local module allowlist'
            assert not errors, 'Unexpected browser page error'
            checks.append('only seven built modules fulfilled locally; no external request or page error')
            print(json.dumps({'passed': len(checks), 'browser': browser.version,
                              'playwright': version('playwright'), 'checks': checks}, indent=2))
        finally:
            context.close()
            browser.close()


if __name__ == '__main__':
    main()
