import { createWorkbench, describeError, SAMPLES, SYNTHETIC_SCOPE } from 'nekon-workbench-model';

const byId = id => document.getElementById(id);
const form = byId('composer');
const status = byId('status');
const fields = ['roomId', 'eventId', 'type', 'schemaVersion', 'contentType', 'content'];
const workspace = byId('workspace');
let workbench;

function clearOutput() {
  byId('metadata').textContent = 'No event inspected.';
  byId('decoded').textContent = 'Content will appear here as text, never as HTML.';
  byId('encoded').value = '';
  byId('byteCount').textContent = '—';
  byId('contentCount').textContent = '—';
  byId('representation').textContent = 'No content';
  byId('reinspect').disabled = true;
  byId('resultState').textContent = 'Awaiting input';
}
function announce(message, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}
function render(result) {
  byId('metadata').textContent = result.metadata;
  byId('decoded').textContent = result.content;
  byId('encoded').value = result.hex;
  byId('byteCount').textContent = String(result.encodedBytes);
  byId('contentCount').textContent = String(result.contentBytes);
  byId('representation').textContent = result.representation;
  byId('reinspect').disabled = false;
  byId('resultState').textContent = 'Canonical payload valid';
  announce('Validated locally. This is plaintext serialization, not an encrypted or delivered message.');
}
function inspect(operation) {
  clearOutput();
  try { render(operation()); }
  catch (error) {
    byId('resultState').textContent = 'Input rejected';
    announce(describeError(error), true);
  }
}
function invalidate() {
  clearOutput();
  announce('Input changed. Validate again to inspect the current content.');
}
function clearAll() {
  for (const field of fields) byId(field).value = field === 'contentType' ? 'text/plain' : '';
  byId('hexInput').value = '';
  clearOutput();
  announce('Cleared this page. Browser-managed copies cannot be guaranteed erased.');
}
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!workbench) return;
  inspect(() => workbench.encode(Object.fromEntries(fields.map(field => [field, byId(field).value]))));
});
byId('inspectForm').addEventListener('submit', event => {
  event.preventDefault();
  if (workbench) inspect(() => workbench.inspectHex(byId('hexInput').value));
});
form.addEventListener('input', invalidate);
byId('hexInput').addEventListener('input', invalidate);
byId('reinspect').addEventListener('click', () => {
  // Capture before inspect clears the result. There is no clipboard access.
  byId('hexInput').value = byId('encoded').value;
  byId('importSection').open = true;
  inspect(() => workbench.inspectHex(byId('hexInput').value));
  byId('hexInput').focus();
});
byId('clearAll').addEventListener('click', () => { clearAll(); byId('content').focus(); });
for (const button of document.querySelectorAll('[data-sample]')) {
  button.addEventListener('click', () => {
    const sample = SAMPLES[button.dataset.sample];
    if (!sample) return;
    for (const field of fields) byId(field).value = ({ ...SYNTHETIC_SCOPE, schemaVersion: '1', ...sample })[field];
    byId('hexInput').value = '';
    clearOutput();
    announce('Synthetic sample loaded. Select “Encode and inspect” to validate it.');
    byId('content').focus();
  });
}
window.addEventListener('pagehide', clearAll);
// Static fallback remains legible when imports fail. No production fallback.
try {
  const sdk = await import('@nekon/sdk/application-event');
  workbench = createWorkbench(sdk);
  byId('content').maxLength = workbench.maximumContentBytes;
  byId('hexInput').maxLength = workbench.maximumHexCharacters;
  workspace.disabled = false;
  byId('loadState').textContent = 'Local SDK loaded';
  announce('Ready. Load a synthetic sample or enter test content. Do not enter secrets.');
} catch {
  byId('loadState').textContent = 'Local SDK unavailable';
  announce('The local SDK could not load. Build the example using the README; no remote fallback is used.', true);
}
