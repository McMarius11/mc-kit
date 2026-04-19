// Copyright (c) 2026 Marius Kamm. MIT.
// dispatch — poll MC for tasks tagged for external (Claude) pickup.

'use strict';

const { request, pickList } = require('./client');
const { loadState } = require('./config');
const { execSync } = require('child_process');

const DEFAULT_TAG = 'claude-dispatch';
const DEFAULT_ASSIGNEE = 'Claude Code (external)';
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

async function pollDispatched(cfg, opts) {
  opts = opts || {};
  const tag = opts.tag ? String(opts.tag).toLowerCase() : null;
  const assignee = opts.assignedTo || DEFAULT_ASSIGNEE;
  const state = loadState(cfg);
  if (!state.project_id) {
    throw new Error('No project bound — run `mc-kit sync push` first to bind this repo.');
  }
  const res = await request(cfg, 'GET', '/api/projects/' + state.project_id + '/tasks');
  if (res.status >= 400) throw new Error('GET tasks failed: ' + res.status);
  const all = pickList(res.data);
  const dispatched = all.filter(t => {
    if (t.status === 'done') return false;
    if (assignee && t.assigned_to === assignee) return true;
    if (tag && (t.tags || []).some(x => String(x).toLowerCase() === tag)) return true;
    return false;
  });
  dispatched.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority || 'medium'] ?? 1;
    const pb = PRIORITY_RANK[b.priority || 'medium'] ?? 1;
    if (pa !== pb) return pa - pb;
    return (a.id || 0) - (b.id || 0);
  });
  return dispatched;
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

module.exports = { pollDispatched, notify, DEFAULT_TAG, DEFAULT_ASSIGNEE };
