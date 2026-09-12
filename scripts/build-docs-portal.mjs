/** Build local no-login docs from the already-built public package contracts. */
import { fileURLToPath } from 'node:url';
import { buildPortal } from './docs-portal.mjs';
if (process.argv.length !== 2) throw new Error('Usage: build-docs-portal.mjs');
const result = await buildPortal(fileURLToPath(new URL('../',import.meta.url)));
console.log(JSON.stringify({message:'Built local docs/portal/dist/index.html and api.json. No publication or hosting.',...result},null,2));
