#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const publicDir = path.resolve(import.meta.dirname, '../public');

function replaceStyles(htmlPath, pageCss) {
  const fullPath = path.join(publicDir, htmlPath);
  let html = fs.readFileSync(fullPath, 'utf8');
  html = html.replace(
    /<style>[\s\S]*?<\/style>/,
    `<link rel="stylesheet" href="/styles/base.css" />\n  <link rel="stylesheet" href="/styles/${pageCss}" />`
  );
  fs.writeFileSync(fullPath, html);
}

replaceStyles('index.html', 'landing.css');
replaceStyles('docs/index.html', 'docs.css');
