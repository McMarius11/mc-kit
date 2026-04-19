// Copyright (c) 2026 Marius Kamm. MIT.
// Zero-dep REST client over the Mission Control API.

'use strict';

const http = require('http');
const { loadConfig, loadState, readApiKey } = require('./config');

const DEFAULT_TIMEOUT_MS = 10000;
const verbose = () => process.env.MC_KIT_VERBOSE === '1';

function request(cfg, method, urlPath, body, opts) {
  opts = opts || {};
  const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const u = new URL(cfg.mc_base + urlPath);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const reqOpts = {
      method,
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      headers: { 'x-api-key': readApiKey(cfg), 'Accept': 'application/json' },
    };
    if (data) {
      reqOpts.headers['Content-Type'] = 'application/json';
      reqOpts.headers['Content-Length'] = data.length;
    }
    if (verbose()) {
      process.stderr.write('[mc-kit] > ' + method + ' ' + urlPath +
        (data ? ' body=' + data.toString('utf8').slice(0, 200) : '') + '\n');
    }
    const rq = http.request(reqOpts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks).toString('utf8');
        let parsed = buf;
        try { parsed = buf ? JSON.parse(buf) : null; } catch (_) {}
        if (verbose()) {
          process.stderr.write('[mc-kit] < ' + res.statusCode + ' ' +
            (typeof parsed === 'string' ? parsed.slice(0, 300) : JSON.stringify(parsed).slice(0, 300)) + '\n');
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    rq.setTimeout(timeout, () => {
      rq.destroy(new Error('Request timed out after ' + timeout + 'ms — is MC running? Check: mc-kit ide:status'));
    });
    rq.on('error', reject);
    if (data) rq.write(data);
    rq.end();
  });
}

// MC wraps POST/GET responses as { task: {...} } or { project: {...} }.
function pickId(obj) {
  if (!obj) return null;
  const inner = obj.task || obj.project || obj;
  return inner.id || inner._id || inner.task_id || inner.project_id || null;
}

function pickList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.items || data.tasks || data.projects || data.agents || data.data || [];
}

/**
 * Resolve a human-friendly identifier to an MC task id.
 * Accepts: raw numeric id, #B<NN> from backlog, PANO-<NN>-style ticket_ref,
 * or any other configured project's prefix.
 */
async function resolveTaskId(cfg, identifier) {
  const state = loadState(cfg);
  if (!state.project_id) throw new Error('No sync-state — run `mc-kit sync push` first to bind project.');

  if (/^\d+$/.test(identifier)) return parseInt(identifier, 10);

  // #B<NN> shape (configurable via cfg.id_prefix)
  const idRe = new RegExp('^#' + cfg.id_prefix + '[0-9a-z]+$', 'i');
  if (idRe.test(identifier)) {
    const key = identifier.startsWith('#') ? identifier : '#' + identifier;
    const id = state.mapping[key];
    if (id) return id;
  }

  // Ticket-ref shape (PANO-005, ABC-001, …) — search project tasks.
  if (/^[A-Za-z]+[- ]\d+$/.test(identifier)) {
    const res = await request(cfg, 'GET', '/api/projects/' + state.project_id + '/tasks');
    const tasks = pickList(res.data);
    const target = identifier.toUpperCase().replace(' ', '-');
    const found = tasks.find(t => (t.ticket_ref || '').toUpperCase() === target);
    if (found) return found.id;
  }

  const hints = [
    'Could not resolve "' + identifier + '" to an MC task id.',
    'Tried: raw-id, #' + cfg.id_prefix + '<NN> mapping, ticket_ref search.',
    '',
    'Common causes:',
    '  - Not yet synced: run `mc-kit sync push` to bind project + map IDs',
    '  - Wrong prefix:  this project uses id_prefix="' + cfg.id_prefix + '" → expected #' + cfg.id_prefix + '<N>',
    '  - Task was deleted in MC but mapping is stale: delete .mc-kit-state.json and re-push',
  ];
  throw new Error(hints.join('\n'));
}

async function listTasks(cfg, filter) {
  const state = loadState(cfg);
  if (!state.project_id) throw new Error('No project bound. Run `mc-kit sync push` first.');
  const res = await request(cfg, 'GET', '/api/projects/' + state.project_id + '/tasks');
  if (res.status >= 400) throw new Error('GET tasks failed: ' + res.status);
  let tasks = pickList(res.data);
  if (filter && filter.status) tasks = tasks.filter(t => t.status === filter.status);
  if (filter && filter.priority) tasks = tasks.filter(t => t.priority === filter.priority);
  tasks.sort((a, b) => {
    const pa = ['high','medium','low'].indexOf(a.priority || 'medium');
    const pb = ['high','medium','low'].indexOf(b.priority || 'medium');
    return pa === pb ? (a.id - b.id) : (pa - pb);
  });
  return tasks;
}

async function getTask(cfg, identifier) {
  const id = await resolveTaskId(cfg, identifier);
  const res = await request(cfg, 'GET', '/api/tasks/' + id);
  if (res.status >= 400) throw new Error('GET task failed: ' + res.status);
  return (res.data && res.data.task) || res.data;
}

async function setStatus(cfg, identifier, newStatus) {
  if (!cfg.valid_statuses.includes(newStatus)) {
    throw new Error('Status must be one of: ' + cfg.valid_statuses.join(', '));
  }
  const id = await resolveTaskId(cfg, identifier);
  const res = await request(cfg, 'PUT', '/api/tasks/' + id, { status: newStatus });
  if (res.status >= 400) throw new Error('Update failed: ' + res.status + ' ' + JSON.stringify(res.data));
  return { id, status: newStatus };
}

async function comment(cfg, identifier, text) {
  if (!text || text.trim().length < 2) throw new Error('Comment text required');
  const id = await resolveTaskId(cfg, identifier);
  const res = await request(cfg, 'POST', '/api/tasks/' + id + '/comments', { content: text });
  if (res.status >= 400) throw new Error('Comment failed: ' + res.status + ' ' + JSON.stringify(res.data));
  return { id };
}

async function openCount(cfg) {
  const tasks = await listTasks(cfg);
  return tasks.filter(t => t.status !== 'done').length;
}

module.exports = {
  request, pickId, pickList, resolveTaskId,
  listTasks, getTask, setStatus, comment, openCount,
};
