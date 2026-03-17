/**
 * Patch sr25519 sources that contain a null-byte template fragment:
 *
 *   `proving${'\0'}0`
 *
 * Even after replacing it with `String.fromCharCode(0)`, Next/SWC can still
 * re-minify it back into the illegal template escape `\00`, which crashes in
 * the browser with:
 *
 *   SyntaxError: Octal escape sequences are not allowed in template strings
 *
 * To make the fix robust, rewrite the label as raw bytes instead of a template
 * string so minification cannot reintroduce the bad escape sequence.
 */
const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'node_modules/@scure/sr25519/index.ts',
  'node_modules/@scure/sr25519/lib/index.js',
  'node_modules/@scure/sr25519/lib/esm/index.js',
  'node_modules/@polkadot/util-crypto/bundle-polkadot-util-crypto.js',
];

const targetCall =
  't.witnessScalar(new Uint8Array([112, 114, 111, 118, 105, 110, 103, 0, 48]), [nonce])';

const patterns = [
  /t\.witnessScalar\(`proving\$\{'\\0'\}0`, \[nonce\]\)/g,
  /t\.witnessScalar\(`proving\$\{String\.fromCharCode\(0\)\}0`, \[nonce\]\)/g,
];

let patchedFiles = 0;

for (const rel of filesToPatch) {
  const file = path.resolve(__dirname, '..', rel);
  if (!fs.existsSync(file)) continue;

  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  for (const pattern of patterns) {
    content = content.replace(pattern, targetCall);
  }

  if (content === original) continue;

  fs.writeFileSync(file, content, 'utf8');
  patchedFiles += 1;
  console.log(`patched: ${rel}`);
}

if (patchedFiles === 0) {
  console.log('fix-octal-escape: no changes needed');
}
