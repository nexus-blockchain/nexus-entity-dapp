#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const DEFAULT_SCAN_DIRS = ['src'];
const ALLOWLIST_PATH = path.join(ROOT, 'scripts/runtime-compat-allowlist.json');
const VALID_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const WRITE_ALLOWLIST = process.argv.includes('--write-allowlist');
const JSON_OUTPUT = process.argv.includes('--json');
const WS_URL = process.env.WS_URL || 'ws://202.140.140.202:9944';
const DEBUG = process.env.RUNTIME_COMPAT_DEBUG === '1';
const CONNECT_TIMEOUT_MS = Number(process.env.RUNTIME_COMPAT_TIMEOUT_MS || 60000);

/**
 * @typedef {{ kind: 'string', value: string } | { kind: 'queryPallet', pallet: string }} BindingValue
 * @typedef {{ kind: 'query', pallet: string, name: string, file: string, line: number, column: number, id: string } | { kind: 'tx', pallet: string, name: string, file: string, line: number, column: number, id: string } | { kind: 'event-pallet', pallet: string, name: '(pallet)', file: string, line: number, column: number, id: string }} RuntimeRef
 */

function walkFiles(dir, output = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'src-tauri') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, output);
      continue;
    }
    if (VALID_EXTENSIONS.has(path.extname(entry.name))) {
      output.push(fullPath);
    }
  }
  return output;
}

function debug(...args) {
  if (DEBUG) {
    console.error('[runtime-compat]', ...args);
  }
}

function loadFiles() {
  return DEFAULT_SCAN_DIRS.flatMap((dir) => {
    const fullPath = path.join(ROOT, dir);
    return fs.existsSync(fullPath) ? walkFiles(fullPath) : [];
  });
}

function unwrapNode(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression?.(current)
  ) {
    current = current.expression;
  }
  return current;
}

function getLineAndColumn(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

function resolveBinding(name, scopes) {
  for (let i = scopes.length - 1; i >= 0; i -= 1) {
    if (scopes[i].has(name)) return scopes[i].get(name);
  }
  return null;
}

function resolveString(node, scopes) {
  const current = unwrapNode(node);
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    return current.text;
  }
  if (ts.isIdentifier(current)) {
    const binding = resolveBinding(current.text, scopes);
    return binding?.kind === 'string' ? binding.value : null;
  }
  return null;
}

function isApiQueryBase(node) {
  const current = unwrapNode(node);
  return ts.isPropertyAccessExpression(current)
    && current.name.text === 'query'
    && ts.isIdentifier(unwrapNode(current.expression))
    && unwrapNode(current.expression).text === 'api';
}

function resolveQueryPallet(node, scopes) {
  const current = unwrapNode(node);
  if (ts.isIdentifier(current)) {
    const binding = resolveBinding(current.text, scopes);
    return binding?.kind === 'queryPallet' ? binding.pallet : null;
  }
  if (ts.isPropertyAccessExpression(current) && isApiQueryBase(current.expression)) {
    return current.name.text;
  }
  if (ts.isElementAccessExpression(current) && isApiQueryBase(current.expression)) {
    return resolveString(current.argumentExpression, scopes);
  }
  return null;
}

function resolveQueryStorage(node, scopes) {
  const current = unwrapNode(node);
  if (ts.isPropertyAccessExpression(current)) {
    const pallet = resolveQueryPallet(current.expression, scopes);
    if (pallet) return { pallet, name: current.name.text };
  }
  if (ts.isElementAccessExpression(current)) {
    const pallet = resolveQueryPallet(current.expression, scopes);
    const name = resolveString(current.argumentExpression, scopes);
    if (pallet && name) return { pallet, name };
  }
  return null;
}

function makeId(kind, file, pallet, name) {
  return `${kind}|${file}|${pallet}|${name}`;
}

function scanFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const relFile = path.relative(ROOT, filePath);
  /** @type {RuntimeRef[]} */
  const refs = [];
  /** @type {Array<Map<string, BindingValue>>} */
  const scopes = [new Map()];

  function pushRef(kind, pallet, name, node) {
    const { line, column } = getLineAndColumn(sourceFile, node);
    refs.push({
      kind,
      pallet,
      name,
      file: relFile,
      line,
      column,
      id: makeId(kind, relFile, pallet, name),
    });
  }

  function setBinding(name, value) {
    scopes[scopes.length - 1].set(name, value);
  }

  function visit(node) {
    let pushedScope = false;
    if (
      ts.isSourceFile(node) ||
      ts.isBlock(node) ||
      ts.isModuleBlock(node) ||
      ts.isCaseBlock(node) ||
      ts.isFunctionLike(node)
    ) {
      if (!ts.isSourceFile(node)) {
        scopes.push(new Map());
        pushedScope = true;
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const stringValue = resolveString(node.initializer, scopes);
      if (stringValue) {
        setBinding(node.name.text, { kind: 'string', value: stringValue });
      } else {
        const pallet = resolveQueryPallet(node.initializer, scopes);
        if (pallet) {
          setBinding(node.name.text, { kind: 'queryPallet', pallet });
        }
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEntityMutation' && node.arguments.length >= 2) {
      const pallet = resolveString(node.arguments[0], scopes);
      const call = resolveString(node.arguments[1], scopes);
      if (pallet && call) {
        pushRef('tx', pallet, call, node);
      }
    }

    const queryStorage = resolveQueryStorage(node, scopes);
    if (queryStorage) {
      pushRef('query', queryStorage.pallet, queryStorage.name, node);
    }

    if (relFile === 'src/hooks/use-entity-events.ts' && ts.isPropertyAssignment(node)) {
      const name = ts.isIdentifier(node.name) ? node.name.text : ts.isStringLiteral(node.name) ? node.name.text : null;
      if (name === 'pallet') {
        const pallet = resolveString(node.initializer, scopes);
        if (pallet) {
          pushRef('event-pallet', pallet, '(pallet)', node);
        }
      }
    }

    ts.forEachChild(node, visit);

    if (pushedScope) {
      scopes.pop();
    }
  }

  visit(sourceFile);
  return refs;
}

function dedupeRefs(refs) {
  return [...new Map(refs.map((ref) => [ref.id, ref])).values()];
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    return Array.isArray(parsed.allowedMissing) ? parsed.allowedMissing : [];
  } catch {
    return [];
  }
}

async function loadMetadata() {
  const [{ ApiPromise, WsProvider }] = await Promise.all([
    import('@polkadot/api'),
  ]);
  const provider = new WsProvider(WS_URL);
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timed out connecting to runtime metadata after ${CONNECT_TIMEOUT_MS}ms: ${WS_URL}`)), CONNECT_TIMEOUT_MS);
  });

  /** @type {ApiPromise | null} */
  let api = null;
  try {
    api = await Promise.race([
      ApiPromise.create({ provider }),
      timeout,
    ]);
    await Promise.race([api.isReady, timeout]);

    const pallets = Object.keys(api.query).filter((key) => !key.startsWith('$'));
    const queryMap = new Map(
      pallets.map((pallet) => [
        pallet,
        new Set(Object.keys(api.query[pallet] || {}).filter((key) => !key.startsWith('$'))),
      ]),
    );
    const txMap = new Map(
      Object.keys(api.tx)
        .filter((key) => !key.startsWith('$'))
        .map((pallet) => [
          pallet,
          new Set(Object.keys(api.tx[pallet] || {}).filter((key) => !key.startsWith('$'))),
        ]),
    );

    return { pallets: new Set(pallets), queryMap, txMap };
  } finally {
    await api?.disconnect().catch(() => {});
    try {
      await provider.disconnect();
    } catch {
      // ignore provider disconnect errors
    }
  }
}

function classifyMissing(refs, metadata) {
  return refs.filter((ref) => {
    if (ref.kind === 'event-pallet') {
      return !metadata.pallets.has(ref.pallet);
    }
    if (ref.kind === 'query') {
      const storages = metadata.queryMap.get(ref.pallet);
      return !storages || !storages.has(ref.name);
    }
    if (ref.kind === 'tx') {
      const calls = metadata.txMap.get(ref.pallet);
      return !calls || !calls.has(ref.name);
    }
    return false;
  });
}

function printHumanReport(report) {
  if (report.missing.length === 0) {
    console.log(`✅ Runtime compatibility check passed against ${report.wsUrl}`);
    return;
  }

  if (report.newMissing.length === 0) {
    console.log(`⚠ Runtime compatibility check found ${report.missing.length} allowlisted issue(s) against ${report.wsUrl}; no new incompatibilities.\n`);
  } else {
    console.log(`❌ Runtime compatibility check found ${report.missing.length} issue(s) against ${report.wsUrl}\n`);
  }
  for (const ref of report.missing) {
    const qualified = ref.kind === 'event-pallet'
      ? ref.pallet
      : `${ref.pallet}.${ref.name}`;
    console.log(`- [${ref.kind}] ${qualified}`);
    console.log(`  ${ref.file}:${ref.line}:${ref.column}`);
  }

  if (report.newMissing.length > 0) {
    console.log(`\nNew issue(s) not in allowlist: ${report.newMissing.length}`);
    for (const ref of report.newMissing) {
      const qualified = ref.kind === 'event-pallet'
        ? ref.pallet
        : `${ref.pallet}.${ref.name}`;
      console.log(`  - ${qualified} (${ref.file}:${ref.line}:${ref.column})`);
    }
  }

  if (report.staleAllowlist.length > 0) {
    console.log(`\nStale allowlist entries: ${report.staleAllowlist.length}`);
    for (const item of report.staleAllowlist) {
      console.log(`  - ${item}`);
    }
  }
}

async function main() {
  debug('loading metadata from', WS_URL);
  const metadata = await loadMetadata();
  debug('metadata loaded');
  debug('scanning files...');
  const refs = dedupeRefs(loadFiles().flatMap((file) => scanFile(file)));
  debug('scanned refs:', refs.length);
  const missing = classifyMissing(refs, metadata);
  debug('missing refs:', missing.length);
  const allowlist = loadAllowlist();
  const allowed = new Set(allowlist);
  const missingIds = new Set(missing.map((ref) => ref.id));

  if (WRITE_ALLOWLIST) {
    fs.writeFileSync(
      ALLOWLIST_PATH,
      `${JSON.stringify({ allowedMissing: [...missingIds].sort() }, null, 2)}\n`,
      'utf8',
    );
    console.log(`Wrote ${missingIds.size} allowlisted runtime compatibility issue(s) to ${path.relative(ROOT, ALLOWLIST_PATH)}`);
    process.exit(0);
  }

  const newMissing = missing.filter((ref) => !allowed.has(ref.id));
  const staleAllowlist = allowlist.filter((item) => !missingIds.has(item));

  const report = {
    wsUrl: WS_URL,
    scannedFiles: loadFiles().length,
    totalRefs: refs.length,
    missing,
    newMissing,
    staleAllowlist,
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exit(newMissing.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Runtime compatibility check failed to run.');
  console.error(error);
  process.exit(1);
});
