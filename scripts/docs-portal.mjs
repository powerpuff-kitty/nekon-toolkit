/** Local docs generator. Treat source text as data; never execute documented modules. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, realpathSync } from 'node:fs';
import { readFile, mkdir, rm, rename, writeFile, realpath } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = /^[a-z][a-z0-9-]{0,79}$/;
export const referenceId = specifier => `ref-${specifier.replace(/^@/, '').replace(/[^a-z0-9-]/g, '-')}`;
const fail = message => { throw new Error(`docs_portal:${message}`); };
const requireThat = (condition, message) => { if (!condition) fail(message); };
function exact(value, keys, label) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), `${label}:object_required`);
  requireThat(Object.keys(value).sort().join('|') === [...keys].sort().join('|'), `${label}:unexpected_fields`);
}
function text(value, max = 8000) {
  requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0'), 'invalid_text');
}
function unique(values, label) { requireThat(new Set(values).size === values.length, `${label}:duplicate`); }
export function sourcePath(value) {
  requireThat(typeof value === 'string' && value.length < 512 && /^[a-zA-Z0-9_./-]+$/.test(value) &&
    !isAbsolute(value) && !value.split('/').some(part => !part || part === '.' || part === '..'), 'unsafe_source_path');
  return value;
}
export async function readWithin(root, path) {
  sourcePath(path);
  const base = await realpath(root);
  const resolved = await realpath(join(base, path));
  requireThat(resolved.startsWith(base + sep), 'source_escapes_root');
  const bytes = await readFile(resolved);
  requireThat(bytes.length <= 2 * 1024 * 1024, 'source_too_large');
  return bytes;
}

/** Strict authoring schema: no inline HTML, arbitrary external links or remote includes. */
export function validateCatalog(catalog) {
  exact(catalog, ['schemaVersion','snapshot','title','packages','modules','examples','pages','errors'], 'catalog');
  requireThat(catalog.schemaVersion === 1 && typeof catalog.snapshot === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(catalog.snapshot), 'unsupported_catalog_version');
  text(catalog.title, 100);
  requireThat(Array.isArray(catalog.packages) && catalog.packages.length > 0 && catalog.packages.length <= 20, 'invalid_packages');
  unique(catalog.packages, 'packages');
  for (const leaf of catalog.packages) requireThat(typeof leaf === 'string' && slug.test(leaf), 'invalid_package_leaf');
  for (const key of ['modules','examples','pages','errors']) requireThat(Array.isArray(catalog[key]) && catalog[key].length <= 100, `invalid_${key}`);
  requireThat(catalog.pages.length > 0 && catalog.pages[0].id === 'start', 'start_page_required');
  for (const module of catalog.modules) {
    exact(module, ['specifier','summary','boundary','environment','credentials'], 'module');
    requireThat(/^@nekon\/[a-z0-9-]+(?:\/[a-z0-9.-]+)?$/.test(module.specifier), 'invalid_specifier');
    for (const key of ['summary','boundary','environment','credentials']) text(module[key], 1200);
  }
  unique(catalog.modules.map(m => m.specifier), 'modules');
  const pageIds = [...catalog.pages.map(p => p.id), ...catalog.modules.map(m => referenceId(m.specifier))];
  unique(pageIds, 'page_ids');
  for (const example of catalog.examples) {
    exact(example, ['id','title','path','mode','environment','credentials','testPath'], 'example');
    requireThat(typeof example.id === 'string' && slug.test(example.id), 'invalid_example_id');
    for (const key of ['title','environment','credentials']) text(example[key], 1200);
    sourcePath(example.path); sourcePath(example.testPath);
    requireThat(['execute','typecheck'].includes(example.mode), 'invalid_example_mode');
    requireThat(example.path.startsWith(example.mode === 'execute' ? 'examples/' : 'tests/') &&
      example.path.endsWith(example.mode === 'execute' ? '.mjs' : '.ts'), 'invalid_example_source');
  }
  unique(catalog.examples.map(e => e.id), 'examples');
  const usedExamples = new Set();
  for (const page of catalog.pages) {
    exact(page, ['id','title','summary','blocks'], 'page');
    requireThat(typeof page.id === 'string' && slug.test(page.id), 'invalid_page_id');
    text(page.title, 100); text(page.summary, 500);
    requireThat(Array.isArray(page.blocks) && page.blocks.length > 0 && page.blocks.length <= 50, 'invalid_page_blocks');
    for (const block of page.blocks) {
      if (['paragraph','heading'].includes(block?.kind)) { exact(block, ['kind','text'], 'block'); text(block.text); }
      else if (block?.kind === 'list') {
        exact(block, ['kind','items'], 'list');
        requireThat(Array.isArray(block.items) && block.items.length > 0 && block.items.length <= 30, 'invalid_list');
        block.items.forEach(item => text(item));
      } else if (block?.kind === 'link') {
        exact(block, ['kind','target','text'], 'link'); text(block.text);
        requireThat(pageIds.includes(block.target), 'broken_internal_link');
      } else if (block?.kind === 'example') {
        exact(block, ['kind','id'], 'example_block');
        requireThat(catalog.examples.some(e => e.id === block.id), 'missing_example'); usedExamples.add(block.id);
      } else if (block?.kind === 'errors') exact(block, ['kind'], 'errors_block');
      else fail('unknown_block_kind');
    }
  }
  requireThat(usedExamples.size === catalog.examples.length, 'unreferenced_example');
  for (const error of catalog.errors) {
    exact(error, ['code','module','guidance'], 'error');
    requireThat(typeof error.code === 'string' && /^[a-z][a-z0-9_]{0,159}$/.test(error.code), 'invalid_error_code');
    sourcePath(error.module);
    requireThat(/^packages\/client-runtime\/dist\/[a-z0-9-]+\.js$/.test(error.module), 'invalid_error_source');
    text(error.guidance, 1500);
  }
  unique(catalog.errors.map(e => e.code), 'errors');
  return catalog;
}

/** Reuse the repository's pinned build-only compiler, including its documented PATH fallback. */
export function loadCompiler(root) {
  const require = createRequire(join(resolve(root), 'package.json'));
  let ts;
  try { ts = require('typescript'); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    const candidate = (process.env.PATH ?? '').split(delimiter).map(dir => join(dir, 'tsc')).find(path => existsSync(path));
    requireThat(candidate !== undefined, 'typescript_5_8_3_required');
    const compilerRoot = dirname(dirname(realpathSync(candidate)));
    ts = require(join(compilerRoot, 'lib/typescript.js'));
  }
  requireThat(ts.version === '5.8.3', 'typescript_5_8_3_required');
  return ts;
}

export function checkInventory(catalog, entries) {
  const actual = entries.map(e => e.specifier).sort();
  const documented = catalog.modules.map(e => e.specifier).sort();
  requireThat(JSON.stringify(actual) === JSON.stringify(documented), 'public_exports_drift');
}
function exportPath(leaf, path) {
  requireThat(typeof path === 'string' && path.startsWith('./dist/'), 'unsupported_export_target');
  return sourcePath(`packages/${leaf}/${path.slice(2)}`);
}
function publicDeclarations(ts, checker, source, root) {
  const module = checker.getSymbolAtLocation(source);
  requireThat(module !== undefined, 'declaration_module_missing');
  return checker.getExportsOfModule(module).sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).map(symbol => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const nodes = target.getDeclarations() ?? [];
    requireThat(nodes.length > 0, 'unresolved_export');
    const signatures = nodes.map(node => {
      const file = node.getSourceFile();
      const path = relative(root, file.fileName).split(sep).join('/');
      requireThat(/^packages\/(?:tokens|client-runtime|sdk)\/dist\//.test(path), 'declaration_outside_public_packages');
      // Variable declarations need their enclosing statement to preserve declare/const/type syntax.
      const printed = ts.isVariableDeclaration(node) ? node.parent.parent : node;
      return { source: path, kind: ts.SyntaxKind[node.kind], declaration: printed.getText(file) };
    });
    return { name: symbol.name, declarations: signatures };
  });
}

export async function collectPortal(root) {
  root = await realpath(root);
  const inputs = new Map();
  const read = async path => { const bytes = await readWithin(root, path); inputs.set(path, hash(bytes)); return bytes.toString('utf8'); };
  const catalog = validateCatalog(JSON.parse(await read('docs/portal/catalog.json')));
  const ts = loadCompiler(root);
  const entries = [];
  for (const leaf of catalog.packages) {
    const path = `packages/${leaf}/package.json`;
    const pkg = JSON.parse(await read(path));
    requireThat(pkg.name === `@nekon/${leaf}` && pkg.private === true && pkg.license === 'UNLICENSED', 'release_status_requires_review');
    requireThat(typeof pkg.version === 'string' && pkg.version.length < 80, 'invalid_package_version');
    requireThat(pkg.exports && typeof pkg.exports === 'object', 'exports_required');
    for (const [subpath, value] of Object.entries(pkg.exports)) {
      requireThat(subpath === '.' || /^\.\/[a-z0-9.-]+$/.test(subpath), 'unsupported_export_key');
      if (typeof value !== 'string') exact(value, ['types','import'], 'export_conditions');
      const specifier = pkg.name + (subpath === '.' ? '' : subpath.slice(1));
      const target = exportPath(leaf, typeof value === 'string' ? value : value.import);
      const types = typeof value === 'object' ? exportPath(leaf, value.types) : undefined;
      requireThat(!types || types.endsWith('.d.ts'), 'declarations_required');
      await read(target); if (types) await read(types);
      entries.push({specifier,package:pkg.name,version:pkg.version,status:'unpublished source preview',manifest:path,target,...(types ? {types} : {})});
    }
  }
  checkInventory(catalog, entries);
  const paths = Object.fromEntries(entries.filter(e => e.types).map(e => [e.specifier, [e.types]]));
  const program = ts.createProgram(entries.filter(e => e.types).map(e => join(root, e.types)), {
    target:ts.ScriptTarget.ES2024, module:ts.ModuleKind.NodeNext, moduleResolution:ts.ModuleResolutionKind.NodeNext,
    strict:true, skipLibCheck:false, noEmit:true, baseUrl:root, paths,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) fail('invalid_declarations:\n' + ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName:p=>p, getCurrentDirectory:()=>root, getNewLine:()=> '\n',
  }));
  const checker = program.getTypeChecker();
  for (const entry of entries) {
    const metadata = catalog.modules.find(m => m.specifier === entry.specifier);
    Object.assign(entry, metadata, {id:referenceId(entry.specifier)});
    entry.symbols = entry.types ? publicDeclarations(ts, checker, program.getSourceFile(join(root,entry.types)),root) : [];
    for (const symbol of entry.symbols) for (const declaration of symbol.declarations) await read(declaration.source);
  }
  const examples = [];
  for (const example of catalog.examples) {
    const source = await read(example.path);
    // Confirm the owning gate exists; actual execution/type-checking is performed in that gate.
    await read(example.testPath);
    examples.push({...example, source, sha256: hash(Buffer.from(source))});
  }
  for (const error of catalog.errors) {
    const source = ts.createSourceFile(error.module, await read(error.module),ts.ScriptTarget.ES2024,true,ts.ScriptKind.JS);
    let found = false;
    const visit = node => { if (ts.isStringLiteral(node) && node.text === error.code) found = true; ts.forEachChild(node,visit); };
    visit(source); requireThat(found, `documented_error_missing:${error.code}`);
  }
  const style = await read('packages/tokens/dist/scoped.css') + '\n' + await read('docs/portal/style.css');
  const app = await read('docs/portal/app.js');
  // Include the generator itself so source fingerprint also identifies rendering behavior.
  await read('scripts/docs-portal.mjs');
  const sourceHashes = Object.fromEntries([...inputs].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0));
  const fingerprint = hash(Buffer.from(JSON.stringify(sourceHashes)));
  return {schemaVersion:1,snapshot:catalog.snapshot,title:catalog.title,publicationAllowed:false,
    compiler:ts.version,fingerprint,inputs:sourceHashes,pages:catalog.pages,modules:entries,examples,errors:catalog.errors,style,app};
}

const codeBlock = (source, language = 'typescript') => `<pre tabindex="0" aria-label="${escape(language)} code"><code>${escape(source)}</code></pre>`;
function renderExample(example) {
  return `<section class="example"><div class="section-row"><h3>${escape(example.title)}</h3><span class="pill">${example.mode === 'execute' ? 'EXECUTABLE EXAMPLE' : 'COMPILE-ONLY CONTRACT'}</span></div>
  <dl><div><dt>Runs in</dt><dd>${escape(example.environment)}</dd></div><div><dt>Credentials</dt><dd>${escape(example.credentials)}</dd></div></dl>
  <p class="source">Source: <code>${escape(example.path)}</code> · ${example.mode === 'execute' ? 'Executed' : 'Type-checked'} in the installed-package gate.</p>${codeBlock(example.source, example.mode === 'execute' ? 'javascript' : 'typescript')}</section>`;
}
function renderErrors(errors) {
  return `<div class="error-list">${errors.map(error => `<section><h3><code>${escape(error.code)}</code></h3><p>${escape(error.guidance)}</p><p class="source">${escape(error.module)}</p></section>`).join('')}</div>`;
}
function renderBlocks(page, model) {
  return page.blocks.map(block => {
    switch(block.kind) {
      case 'paragraph': return `<p>${escape(block.text)}</p>`;
      case 'heading': return `<h2>${escape(block.text)}</h2>`;
      case 'list': return `<ul>${block.items.map(item=>`<li>${escape(item)}</li>`).join('')}</ul>`;
      case 'link': return `<p class="guide-link"><a href="#${escape(block.target)}">${escape(block.text)} <span aria-hidden="true">↗</span></a></p>`;
      case 'example': return renderExample(model.examples.find(e=>e.id===block.id));
      case 'errors': return renderErrors(model.errors);
      default: return fail('unhandled_block');
    }
  }).join('\n');
}
export function renderPortal(model) {
  requireThat(!/<\/style/i.test(model.style) && !/<\/script/i.test(model.app), 'closing_element_in_asset');
  const cspHash = text => createHash('sha256').update(text).digest('base64');
  const csp = `default-src 'none'; script-src 'sha256-${cspHash(model.app)}'; style-src 'sha256-${cspHash(model.style)}'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`;
  const navItem = (id,title) => `<a href="#${escape(id)}" data-nav="${escape(id)}">${escape(title)}</a>`;
  const pageHeader = (title,summary,kicker) => `<p class="eyebrow">${escape(kicker)}</p><h1 tabindex="-1">${escape(title)}</h1><p class="lede">${escape(summary)}</p>`;
  const articles = model.pages.map(page => `<article id="${escape(page.id)}" data-page data-title="${escape(page.title)}" data-summary="${escape(page.summary)}">${pageHeader(page.title,page.summary,'GUIDE / SOURCE PREVIEW')}${renderBlocks(page,model)}</article>`);
  for (const entry of model.modules) {
    articles.push(`<article id="${escape(entry.id)}" data-page data-title="${escape(entry.specifier)}" data-summary="${escape(entry.summary)}">
      ${pageHeader(entry.specifier,entry.summary,'GENERATED REFERENCE / ' + entry.version)}
      <p class="notice">${escape(entry.boundary)}</p><dl><div><dt>Runs in</dt><dd>${escape(entry.environment)}</dd></div><div><dt>Credentials</dt><dd>${escape(entry.credentials)}</dd></div></dl>
      <p class="source">Export map: <code>${escape(entry.manifest)}</code><br>Target: <code>${escape(entry.target)}</code>${entry.types ? '<br>Types: <code>'+escape(entry.types)+'</code>' : ''}</p>
      <h2>${entry.symbols.length ? entry.symbols.length+' public declarations' : 'Asset export'}</h2>
      <p>${entry.symbols.length ? 'Resolved from the emitted declarations, following SDK re-exports to the shared implementation. This is a static API contract, not runtime or service verification.' : 'This export is a generated asset, not a JavaScript API or component.'}</p>
      ${entry.symbols.map(symbol => `<section class="symbol"><h3><code>${escape(symbol.name)}</code></h3>${symbol.declarations.map(d=>`<p class="source">${escape(d.source)}</p>${codeBlock(d.declaration)}`).join('')}</section>`).join('')}
    </article>`);
  }
  const html = `<!doctype html>
<html lang="en" data-nk-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${escape(csp)}"><title>${escape(model.title)}</title><style>${model.style}</style></head>
<body><a class="skip" href="#content">Skip to content</a><header class="topbar"><a class="brand" href="#start">NEKON<span> / DOCS</span></a><div class="top-meta"><span>SNAPSHOT ${escape(model.snapshot)}</span><span class="pill">UNPUBLISHED SOURCE PREVIEW</span></div></header>
<div class="layout"><aside class="sidebar"><label for="search">Search documentation</label><input id="search" type="search" disabled maxlength="160" placeholder="Search APIs, guides, errors…" autocomplete="off" spellcheck="false"><p class="search-hint">Local search · no requests or storage</p><p id="searchHelp" class="search-hint">Search requires JavaScript. Without it, use the navigation to read every page.</p><p id="searchStatus" role="status" aria-live="polite"></p><ul id="searchResults" hidden aria-label="Search results"></ul>
<details class="navigation" open><summary>Documentation navigation</summary><nav aria-label="Documentation"><h2>GET STARTED</h2>${model.pages.map(p=>navItem(p.id,p.title)).join('')}<h2>API REFERENCE</h2>${model.modules.map(e=>navItem(e.id,e.specifier)).join('')}</nav></details></aside>
<main id="content" tabindex="-1"><div class="snapshot-banner"><span>LOCAL DOCS / ${model.modules.length} EXPORTS / ${model.pages.length} GUIDES</span><span>No account. No Cloud connection.</span></div><noscript><p class="notice">JavaScript is disabled. All documentation remains readable; use the navigation links. Search requires JavaScript.</p></noscript>
${articles.join('\n')}<footer><p>Generated from package exports, declarations and maintained examples. Publication is disabled.</p><p>Source fingerprint <code>${escape(model.fingerprint)}</code></p></footer></main></div><script>${model.app}</script></body></html>\n`;
  requireThat(Buffer.byteLength(html) <= 2 * 1024 * 1024, 'artifact_budget_exceeded');
  return html;
}

export async function buildPortal(root) {
  root = await realpath(root);
  const parent = await realpath(join(root,'docs/portal'));
  requireThat(parent.startsWith(root + sep), 'output_escapes_root');
  const output = join(parent,'dist');
  // Failed validation must never leave an older apparently current docs snapshot behind.
  await rm(output,{recursive:true,force:true});
  try {
    const model = await collectPortal(root);
    const html = renderPortal(model);
    const {style,app,...catalog} = model;
    const json = JSON.stringify(catalog,null,2)+'\n';
    requireThat(Buffer.byteLength(json) <= 2 * 1024 * 1024, 'catalog_budget_exceeded');
    await mkdir(output,{recursive:true});
    for (const [file,body] of [['index.html',html],['api.json',json]]) {
      await writeFile(join(output,file+'.tmp'),body);
      await rename(join(output,file+'.tmp'),join(output,file));
    }
    return {pages:model.pages.length + model.modules.length,exports:model.modules.length,
      symbols:model.modules.reduce((n,m)=>n+m.symbols.length,0),examples:model.examples.length,
      bytes:Buffer.byteLength(html),fingerprint:model.fingerprint};
  } catch (error) { await rm(output,{recursive:true,force:true}); throw error; }
}
