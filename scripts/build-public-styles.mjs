#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'public');
const stylesDir = path.join(publicDir, 'styles');

function extractStyleBlock(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!match) {
    throw new Error(`No inline style block found in ${htmlPath}`);
  }

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^ {4}/, ''))
    .join('\n')
    .trim();
}

function stripBlocks(css, blockNames) {
  let next = css;

  for (const name of blockNames) {
    const pattern = new RegExp(`\\n\\s*${name}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
    next = next.replace(pattern, '');
  }

  return next.replace(/\n{3,}/g, '\n\n').trim();
}

const landingCss = extractStyleBlock(path.join(publicDir, 'index.html'));
const docsCss = extractStyleBlock(path.join(publicDir, 'docs/index.html'));

const baseCss = `/* Shared Raindrop MCP static styles */
:root {
  --bg: #fbfcfd;
  --ink: #0b1f3a;
  --ink-2: #536174;
  --ink-3: #8a95a4;
  --border: #dde4ee;
  --border-strong: #b8c4d4;
  --blue: #0b63f6;
  --blue-dark: #074bbb;
  --surface: rgba(255, 255, 255, 0.92);
  --surface-solid: #ffffff;
  --soft: #f4f7fb;
  --shadow: 0 24px 60px rgba(11, 31, 58, 0.13);
  --good: #16a34a;
  --radius-pill: 999px;
  --radius-card: 14px;
  --font-ui: "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
}

html,
body {
  min-height: 100%;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  overflow-x: hidden;
}

a {
  color: inherit;
  text-decoration: none;
}

button {
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

code,
pre {
  font-family: var(--font-mono);
}

:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 3px;
}

.site-frame {
  position: relative;
  min-height: calc(100vh - 20px);
  margin: 10px;
  overflow: hidden;
  border: 1px solid rgba(11, 31, 58, 0.14);
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(11, 31, 58, 0.04);
}

.site-frame::before,
.site-frame::after {
  content: "";
  position: absolute;
  width: min(520px, 34vw);
  height: min(880px, 86vh);
  pointer-events: none;
  opacity: 0.55;
  background-image: radial-gradient(circle, rgba(11, 99, 246, 0.34) 1.2px, transparent 1.35px);
  background-size: 8px 8px;
  -webkit-mask-image: radial-gradient(ellipse at center, #000 0 34%, rgba(0,0,0,0.62) 49%, transparent 72%);
  mask-image: radial-gradient(ellipse at center, #000 0 34%, rgba(0,0,0,0.62) 49%, transparent 72%);
  z-index: 0;
}

.site-frame::before {
  left: max(-210px, -12vw);
  top: 180px;
}

.site-frame::after {
  right: max(-190px, -10vw);
  top: 54px;
  height: min(760px, 76vh);
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 26px;
  z-index: 20;
  padding: 9px 15px;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: #ffffff;
  font-size: 13px;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 8px);
  transition: opacity 150ms ease, transform 150ms ease;
}

.toast[data-show="true"] {
  opacity: 1;
  transform: translate(-50%, 0);
}
`;

const sharedBlocks = [
  ':root',
  '\\*',
  'html',
  'body',
  'a',
  'button',
  'code,\\s*pre',
  ':focus-visible',
  '\\.site-frame',
  '\\.toast',
];

function stripShared(css) {
  let next = css;
  next = next.replace(/^:root\s*\{[\s\S]*?\}\s*/m, '');
  next = next.replace(/^\*,[\s\S]*?:focus-visible\s*\{[\s\S]*?\}\s*/m, '');
  next = next.replace(/\.site-frame[\s\S]*?\.site-frame::after\s*\{[\s\S]*?\}\s*/m, '');
  next = next.replace(/\.toast[\s\S]*?\.toast\[data-show="true"\]\s*\{[\s\S]*?\}\s*/m, '');
  return next.replace(/\n{3,}/g, '\n\n').trim();
}

fs.mkdirSync(stylesDir, { recursive: true });
fs.writeFileSync(path.join(stylesDir, 'base.css'), `${baseCss.trim()}\n`);
fs.writeFileSync(path.join(stylesDir, 'landing.css'), `${stripShared(landingCss)}\n`);
fs.writeFileSync(path.join(stylesDir, 'docs.css'), `${stripShared(docsCss)}\n`);

console.log('Wrote public/styles/base.css, landing.css, docs.css');
