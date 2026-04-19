// Copyright (c) 2026 Marius Kamm. MIT.
// Playwright-based headless screenshot helper. Optional feature —
// enabled when cfg.bundle_path is set in .mc-kit.json.

'use strict';

const fs   = require('fs');
const path = require('path');

async function capture(cfg, args) {
  if (!cfg.bundle_path) {
    throw new Error('Screenshot disabled — set `bundle_path` in .mc-kit.json to enable.');
  }
  const [xmlPath, tabId, outPath] = args;
  if (!xmlPath || !tabId || !outPath) {
    throw new Error('Usage: mc-kit screenshot <xml-file> <tab-id> <out.png>');
  }
  const absXml = path.resolve(xmlPath);
  const absOut = path.resolve(outPath);
  if (!fs.existsSync(absXml))          throw new Error('XML not found: ' + absXml);
  if (!fs.existsSync(cfg.bundle_path)) throw new Error('Bundle not found: ' + cfg.bundle_path);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  let chromium;
  try { chromium = require('playwright').chromium; }
  catch (_) { throw new Error('playwright not installed. Install in your project: npm install -D playwright'); }

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page    = await ctx.newPage();
  page.on('pageerror', e => console.warn('[page err]', e.message));

  await page.goto('file://' + cfg.bundle_path);
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error('No file input found in bundle — layout changed?');
  await fileInput.setInputFiles(absXml);
  await page.waitForSelector('[data-nav-tab="' + tabId + '"]', { timeout: 10000 });
  await page.click('[data-nav-tab="' + tabId + '"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: absOut, fullPage: true });
  await browser.close();
  return absOut;
}

module.exports = { capture };
