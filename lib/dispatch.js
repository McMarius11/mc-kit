// Copyright (c) 2026 Marius Kamm. MIT.
// dispatch — poll MC for tasks tagged for external (Claude) pickup.

'use strict';

const { request, pickList } = require('./client');
const { loadState } = require('./config');
const { execSync } = require('child_process');

const DEFAULT_TAG = 'claude-dispatch';
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

async function pollDispatched(cfg, opts) {
  opts = opts || {};
  const tag = (opts.tag || DEFAULT_TAG).toLowerCase();
  const state = loadState(cfg);
  if (!state.project_id) {
    throw new Error('No project bound — run `mc-kit sync push` first to bind this repo.');
  }
  const res = await request(cfg, 'GET', '/api/projects/' + state.project_id + '/tasks');
  if (res.status >= 400) throw new Error('GET tasks failed: ' + res.status);
  const all = pickList(res.data);
  const tagged = all.filter(t =>
    t.status !== 'done' &&
    (t.tags || []).some(x => String(x).toLowerCase() === tag)
  );
  tagged.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority || 'medium'] ?? 1;
    const pb = PRIORITY_RANK[b.priority || 'medium'] ?? 1;
    if (pa !== pb) return pa - pb;
    return (a.id || 0) - (b.id || 0);
  });
  return tagged;
}

function notify(title, body) {
  try {
    execSync(`notify-send ${JSON.stringify(title)} ${JSON.stringify(body || '')}`, {
      stdio: 'ignore',
      timeout: 2000,
    });
  } catch (_) {
    // notify-send missing / DBus unavailable / timeout — silent fallback
  }
}

module.exports = { pollDispatched, notify, DEFAULT_TAG };
