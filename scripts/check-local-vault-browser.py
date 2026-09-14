"""Real IndexedDB/WebCrypto checks on an ephemeral loopback page.

Uses a test-only SHA-256 derivation, NOT the production Argon2/WASM provider.
No navigation-policy changes or external network access are permitted.
"""
from __future__ import annotations
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import version
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', type=Path, default=Path('/usr/bin/chromium'))
    args = parser.parse_args()
    if version('playwright') != '1.57.0':
        raise SystemExit('Use the pinned scripts/browser-requirements.txt environment.')
    modules = {
        '/vault.js': ('text/javascript', (ROOT / 'packages/client-runtime/dist/local-vault.js').read_bytes()),
        '/': ('text/html', b'<!doctype html><html lang="en"><title>Local vault verification</title></html>'),
    }

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            value = modules.get(self.path)
            if value is None:
                self.send_error(404)
                return
            kind, body = value
            self.send_response(200)
            self.send_header('Content-Type', kind)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    unexpected: list[str] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=str(args.chromium.resolve(strict=True)), headless=True)
            context = browser.new_context()
            try:
                def route(request):
                    if request.request.url not in [origin + path for path in modules]:
                        unexpected.append(request.request.url)
                        request.abort()
                    else:
                        request.continue_()
                context.route('**/*', route)
                page = context.new_page()
                # Failure here is a failed gate, not a skip or permission to bypass policy.
                page.goto(origin + '/', timeout=10000)
                checks = page.evaluate('''async () => {
                  const { LocalSecretVault, IndexedDbVaultStorage } = await import('/vault.js');
                  const checks = [];
                  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
                  const reject = async (operation, code) => {
                    try { await operation; } catch(error) { if (error.message.includes(code)) return; throw error; }
                    throw new Error('Expected rejection: '+code);
                  };
                  check(isSecureContext && !!crypto.subtle && !!indexedDB, 'native IndexedDB and WebCrypto available');
                  const db = 'nekon-test-vault-' + crypto.randomUUID();
                  const storage = new IndexedDbVaultStorage(db);
                  // Deliberately test-only derivation. The Argon2 reference is a separate Node lane.
                  const deriveKey = async (secret,salt) => {
                    const bytes = new Uint8Array(secret.length+salt.length); bytes.set(secret); bytes.set(salt,secret.length);
                    try { return new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)); } finally {bytes.fill(0);}
                  };
                  const make = () => new LocalSecretVault({storage:new IndexedDbVaultStorage(db),deriveKey,inactivityLockMs:null});
                  const secret = 'synthetic-browser-secret';
                  const vault = make(); await vault.create(secret);
                  check((await storage.readHeader()).headerRevision === 1, 'create persists the real encrypted header');
                  const plaintext = new TextEncoder().encode('synthetic persistent record');
                  await vault.write({recordId:'example:one',kind:'enterprise_provisioning',plaintext,expectedRevision:0});
                  const persisted = await storage.readRecord('example:one');
                  check(persisted.ciphertext instanceof Uint8Array && persisted.ciphertext.length===plaintext.length+16,
                    'actual IndexedDB stores authenticated ciphertext');
                  await vault.lockAndDrain(); const reopened=make(); await reopened.unlock(secret);
                  const result=await reopened.read('example:one','enterprise_provisioning');
                  check(new TextDecoder().decode(result.plaintext)==='synthetic persistent record','new vault instance reopens persisted data');
                  result.plaintext.fill(0);
                  const second=make();await second.unlock(secret);
                  const write=(v,text)=>v.write({recordId:'example:one',kind:'enterprise_provisioning',plaintext:new TextEncoder().encode(text),expectedRevision:1});
                  const outcomes=await Promise.allSettled([write(reopened,'first'),write(second,'second')]);
                  check(outcomes.filter(value=>value.status==='fulfilled').length===1,'real IndexedDB CAS selects one concurrent writer');
                  await reopened.mutateRecordsAtomically([
                    {recordId:'example:one',kind:'enterprise_provisioning',expectedRevision:2},
                    {recordId:'example:two',kind:'enterprise_provisioning',plaintext:new Uint8Array([1]),expectedRevision:0},
                  ]);
                  check((await reopened.inspectRecord('example:one','enterprise_provisioning')).deleted===true,'atomic transaction stores authenticated tombstone');
                  await reject(reopened.mutateRecordsAtomically([
                    {recordId:'example:three',kind:'enterprise_provisioning',plaintext:new Uint8Array([3]),expectedRevision:0},
                    {recordId:'example:two',kind:'enterprise_provisioning',expectedRevision:0},
                  ]),'vault_record_revision_conflict');
                  check(await storage.readRecord('example:three')===null,'failed real transaction does not partially commit');
                  await reopened.changeUnlockSecret(secret,'synthetic-updated-secret');
                  const final=make();await reject(final.unlock(secret),'vault_unlock_failed');await final.unlock('synthetic-updated-secret');
                  check(final.state==='unlocked','secret rewrap survives IndexedDB reopen');
                  await final.destroy();check(await storage.readHeader()===null&&await storage.readRecord('example:two')===null,'destroy removes disposable test records');
                  // Separate disposable namespace: exercise the SAME adapter across
                  // real versionchange, VersionError, deletion and explicit reopen.
                  const connectionDb = 'nekon-test-connection-' + crypto.randomUUID();
                  const connectionStore = new IndexedDbVaultStorage(connectionDb);
                  const requestResult = request => new Promise((resolve,reject) => {
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                  });
                  const initial = await connectionStore.readHeader();
                  check(initial === null, 'new native connection namespace has no vault header');
                  const upgraded = await requestResult(indexedDB.open(connectionDb,2));
                  upgraded.close();
                  await reject(connectionStore.readHeader(),'vault_storage_open_failed');
                  check(true, 'versionchange releases native connection and retains version-1 policy');
                  await requestResult(indexedDB.deleteDatabase(connectionDb));
                  check(await connectionStore.readHeader() === null,
                    'same adapter recovers after terminal native version error without creating vault keys');
                  await requestResult(indexedDB.deleteDatabase(connectionDb));
                  check(await connectionStore.readHeader() === null,
                    'same adapter reopens after native deletion versionchange without a stale handle');
                  await requestResult(indexedDB.deleteDatabase(connectionDb));
                  return checks;
                }''')
                if unexpected:
                    raise AssertionError('Unexpected request outside the two-route loopback allowlist')
                print(json.dumps({'passed':len(checks), 'browser':browser.version, 'checks':checks,
                                  'storage':'real IndexedDB', 'kdf':'test-only; not Argon2/WASM'}, indent=2))
            finally:
                context.close()
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == '__main__':
    main()
