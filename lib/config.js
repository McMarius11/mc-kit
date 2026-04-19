// Copyright (c) 2026 Marius Kamm. MIT.
// Config loader — reads .mc-kit.json from the project root (or any ancestor of cwd).

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const DEFAULTS = {
  // Mission Control connection
  mc_base:         'http://localhost:3000',
  mc_env_file:     path.join(os.homedir(), 'Arbeit', 'mission-control', '.env'),
  mc_dir:          path.join(os.homedir(), 'Arbeit', 'mission-control'),

  // Per-project identity in MC
  project_name:    null,              // REQUIRED — must be set in .mc-kit.json
  project_desc:    '',

  // Backlog
  backlog_path:    'docs/BACKLOG.md', // relative to project root
  id_prefix:       'B',               // IDs of the form #B<NN>, #B<NN><letter>
  themes:          ['AUDIT', 'PARITY', 'UX', 'PERF', 'TRUST'],

  // Status workflow (MC's six-column Kanban)
  valid_statuses:  ['inbox','assigned','in_progress','review','quality_review','done'],

  // Optional — for the screenshot helper
  bundle_path:     null,              // e.g. "app-bundle.html"; null = feature disabled
  screenshot_dir:  'tools/screenshots',

  // Optional — status-generator output
  status_path:     'docs/STATUS.md',
  agent_reports_dir: 'docs/.agent-reports',
};

/**
 * Find the project root by walking up from `start` looking for .mc-kit.json.
 * Returns the directory path containing the config, or null if not found.
 */
function findProjectRoot(start) {
  let dir = path.resolve(start || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(dir, '.mc-kit.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;  // reached filesystem root
    dir = parent;
  }
}

/**
 * Load and merge config with defaults. Throws if no .mc-kit.json found
 * unless `optional` is true (used by `init` subcommand).
 */
function loadConfig(opts) {
  opts = opts || {};
  const root = findProjectRoot(opts.start);
  if (!root) {
    if (opts.optional) return { _root: null, ...DEFAULTS };
    throw new Error(
      'No .mc-kit.json found in ' + (opts.start || process.cwd()) +
      ' or any parent directory. Run `mc-kit init` to create one.'
    );
  }
  const raw = JSON.parse(fs.readFileSync(path.join(root, '.mc-kit.json'), 'utf8'));
  const merged = Object.assign({}, DEFAULTS, raw, { _root: root });
  // Resolve relative paths against project root.
  ['backlog_path', 'screenshot_dir', 'status_path', 'agent_reports_dir', 'bundle_path']
    .forEach(k => { if (merged[k] && !path.isAbsolute(merged[k])) merged[k] = path.join(root, merged[k]); });
  // Validate required fields
  if (!merged.project_name) throw new Error('.mc-kit.json is missing required field: project_name');
  return merged;
}

/**
 * State file location — lives alongside the project's .mc-kit.json.
 * Holds the #B<NN> → MC-task-id mapping and the resolved MC project_id.
 */
function statePath(cfg) {
  return path.join(cfg._root, '.mc-kit-state.json');
}

function loadState(cfg) {
  const p = statePath(cfg);
  if (!fs.existsSync(p)) return { project_id: null, mapping: {} };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return { project_id: null, mapping: {} }; }
}

function saveState(cfg, state) {
  fs.writeFileSync(statePath(cfg), JSON.stringify(state, null, 2));
}

/**
 * Read the API key from the MC .env (configured via cfg.mc_env_file).
 */
function readApiKey(cfg) {
  if (!fs.existsSync(cfg.mc_env_file)) {
    throw new Error('Mission Control .env not found at ' + cfg.mc_env_file +
      '\nMake sure MC is installed, or adjust `mc_env_file` in .mc-kit.json');
  }
  const env = fs.readFileSync(cfg.mc_env_file, 'utf8');
  const m = /^\s*API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/m.exec(env);
  if (!m) throw new Error('API_KEY missing from ' + cfg.mc_env_file + ' — uncomment and set it');
  return m[1].trim();
}

module.exports = { DEFAULTS, findProjectRoot, loadConfig, loadState, saveState, readApiKey };
