// Copyright (c) 2026 Marius Kamm. MIT.
// Bidirectional sync: docs/BACKLOG.md ↔ Mission Control tasks.

'use strict';

const fs = require('fs');
const { loadConfig, loadState, saveState } = require('./config');
const { request, pickId, pickList } = require('./client');

const PRIORITY_BY_SECTION = { high: 'high', medium: 'medium', low: 'low', done: 'low' };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseBacklog(cfg) {
  const md = fs.readFileSync(cfg.backlog_path, 'utf8');
  const items = [];
  let section = null;
  // Dynamic regex built from configured id_prefix + themes.
  const themeRe = cfg.themes.join('|');
  const itemRe = new RegExp(
    '^\\-\\s*\\[([ xX])\\]\\s*' +
    '(?:`[^`]+`\\s*)?' +                                    // optional date prefix
    '`(#' + cfg.id_prefix + '[0-9a-z]+)`\\s*' +             // ID
    '`\\[(' + themeRe + ')\\]`\\s*' +                       // theme tag
    '(.*)$'
  );
  md.split('\n').forEach(line => {
    if (/^## High priority/i.test(line))         section = 'high';
    else if (/^## Medium priority/i.test(line)) section = 'medium';
    else if (/^## Low priority/i.test(line))    section = 'low';
    else if (/^## Done/i.test(line))            section = 'done';
    else if (/^##\s/.test(line))                section = null;
    const m = itemRe.exec(line);
    if (m && section) {
      items.push({
        id:      m[2],
        theme:   m[3],
        done:    /[xX]/.test(m[1]) || section === 'done',
        section,
        summary: m[4].replace(/\s*_\([^)]*\)_\s*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim(),
      });
    }
  });
  return items;
}

async function ensureProject(cfg, state, dry) {
  if (state.project_id) {
    const r = await request(cfg, 'GET', '/api/projects/' + state.project_id);
    if (r.status < 400) return state.project_id;
  }
  const list = await request(cfg, 'GET', '/api/projects');
  if (list.status >= 400) throw new Error('GET /api/projects failed: ' + list.status);
  const found = pickList(list.data).find(p => p.name === cfg.project_name);
  if (found) return pickId(found);
  if (dry) { console.log('(Dry) project "' + cfg.project_name + '" would be created.'); return '<would-create>'; }
  const created = await request(cfg, 'POST', '/api/projects', {
    name: cfg.project_name,
    description: cfg.project_desc || ('Tasks for ' + cfg.project_name),
  });
  if (created.status >= 400) throw new Error('POST /api/projects failed: ' + created.status + ' ' + JSON.stringify(created.data));
  return pickId(created.data);
}

async function push(cfg, opts) {
  opts = opts || {};
  const dry = !!opts.dry;
  // Done-section items are the project's historical archive — they belong in
  // BACKLOG.md for the audit trail, not the active Kanban. Aegis-style MC
  // installs also reject direct status=done transitions, so pushing them
  // would error anyway. Pull flips them later if MC moves an active task.
  const all = parseBacklog(cfg);
  const items = all.filter(it => it.section !== 'done');
  const skippedDone = all.length - items.length;

  const state = loadState(cfg);
  state.project_id = await ensureProject(cfg, state, dry);
  console.log('Project: ' + cfg.project_name + ' (id ' + state.project_id + ')');
  console.log('Active backlog items: ' + items.length + ' (skipping ' + skippedDone + ' archived done)');
  if (dry) console.log('--- DRY RUN ---');

  let created = 0, updated = 0, errors = 0;
  for (const it of items) {
    const body = {
      title:       it.id + ' ' + it.summary.slice(0, 100),
      description: `**Backlog ID:** \`${it.id}\`\n**Theme:** \`${it.theme}\`\n\n${it.summary}`,
      status:      it.done ? 'done' : 'inbox',
      priority:    PRIORITY_BY_SECTION[it.section] || 'medium',
      tags:        [it.id, it.theme],
      project_id:  state.project_id,
    };
    const existing = state.mapping[it.id];
    try {
      if (existing) {
        if (dry) { console.log('WOULD update ' + it.id); continue; }
        const r = await request(cfg, 'PUT', '/api/tasks/' + existing, body);
        if (r.status < 400) { updated++; process.stdout.write('.'); }
        else { errors++; console.warn('\n  update failed ' + it.id + ': ' + r.status); }
      } else {
        if (dry) { console.log('WOULD create ' + it.id + ' "' + body.title.slice(0, 60) + '"'); continue; }
        const r = await request(cfg, 'POST', '/api/tasks', body);
        if (r.status < 400) {
          const tid = pickId(r.data);
          if (tid) { state.mapping[it.id] = tid; created++; process.stdout.write('+'); }
          else { errors++; console.warn('\n  create returned no id for ' + it.id); }
        } else { errors++; console.warn('\n  create failed ' + it.id + ': ' + r.status); }
      }
    } catch (e) {
      errors++;
      console.warn('\n  ' + it.id + ' error: ' + e.message);
    }
    // MC rate-limits around 20 req/sec per API key. 200ms = 5 req/sec — comfortable.
    if (!dry) await sleep(200);
  }
  process.stdout.write('\n');
  if (!dry) saveState(cfg, state);
  console.log('Created: ' + created + ', Updated: ' + updated + ', Errors: ' + errors);
  return { created, updated, errors };
}

async function pull(cfg, opts) {
  opts = opts || {};
  const dry = !!opts.dry;
  const state = loadState(cfg);
  if (!state.project_id) { console.log('No sync-state. Run `mc-kit sync push` first.'); return { changed: 0 }; }

  const r = await request(cfg, 'GET', '/api/projects/' + state.project_id + '/tasks');
  if (r.status >= 400) throw new Error('List tasks failed: ' + r.status);
  const tasks = pickList(r.data);
  const completed = new Map();
  const idRe = new RegExp('^#' + cfg.id_prefix + '[0-9a-z]+$', 'i');
  tasks.forEach(t => {
    const bid = (t.tags || []).find(tag => idRe.test(tag));
    if (bid && t.status === 'done') completed.set(bid, t);
  });
  console.log('Tasks marked done in MC: ' + completed.size);
  if (dry || completed.size === 0) return { changed: 0 };

  let md = fs.readFileSync(cfg.backlog_path, 'utf8');
  let changed = 0;
  completed.forEach((t, id) => {
    const re = new RegExp('^(\\-\\s*\\[)[ ]\\](\\s*`' + id.replace('#', '\\#') + '`)', 'm');
    if (re.test(md)) { md = md.replace(re, '$1x]$2'); changed++; }
  });
  if (changed) { fs.writeFileSync(cfg.backlog_path, md); console.log('Marked ' + changed + ' items done in BACKLOG.md'); }
  return { changed };
}

module.exports = { parseBacklog, ensureProject, push, pull };
