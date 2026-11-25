import fs from 'node:fs';
import path from 'node:path';

import { createUserscriptHeader } from '../src/meta.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const OUTPUT_FILE = path.join(DIST_DIR, 'google-ai-search-shortcuts.user.js');
const META_OUTPUT_FILE = path.join(DIST_DIR, 'google-ai-search-shortcuts.meta.js');

const SOURCE_FILES = [
  'src/lib/scrolling.js',
  'src/lib/dom.js',
  'src/features/page-scroll.js',
  'src/features/search-threads.js',
  'src/main.js',
];

function stripModuleSyntax(code) {
  // Remove single-line and multi-line ESM import statements
  let stripped = code.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n?/gm, '');
  // Convert exported declarations into local declarations
  stripped = stripped.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, '');
  return stripped.trim();
}

function build() {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const header = createUserscriptHeader({ version: pkg.version });

  const sections = SOURCE_FILES.map((relPath) => {
    const absPath = path.join(ROOT_DIR, relPath);
    const raw = fs.readFileSync(absPath, 'utf8');
    const body = stripModuleSyntax(raw);
    return `  // --- ${relPath} ---\n${body
      .split('\n')
      .map((line) => (line.length > 0 ? `  ${line}` : ''))
      .join('\n')}`;
  });

  const bundle = `${header}

(function () {
  'use strict';

${sections.join('\n\n')}
})();
`;
  const meta = `${header}\n`;

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, bundle, 'utf8');
  fs.writeFileSync(META_OUTPUT_FILE, meta, 'utf8');
  console.log(`Built ${path.relative(ROOT_DIR, OUTPUT_FILE)} (${bundle.length} bytes)`);
  console.log(`Built ${path.relative(ROOT_DIR, META_OUTPUT_FILE)} (${meta.length} bytes)`);
}

build();
