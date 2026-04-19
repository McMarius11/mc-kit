// Copyright (c) 2026 Marius Kamm. MIT.
// doctor — health-check + onboarding-fix helpers for Mission Control.

'use strict';

const fs = require('fs');
const { request, pickList } = require('./client');
const { loadState, saveState } = require('./config');

async function ensureStubAgent(cfg) {
  const res = await request(cfg, 'GET', '/api/agents?limit=1');
  if (res.status >= 400) {
    throw new Error('GET /api/agents failed: ' + res.status + ' ' + JSON.stringify(res.data));
  }
  const existing = pickList(res.data);
  if (existing.length > 0) return { created: false, count: existing.length };

  const body = {
    name: 'Claude Code (external)',
    role: 'orchestrator',
    status: 'offline',
    config: {
      provider: 'claude-max-oauth',
      orchestrator: true,
      note: 'Placeholder so the Launch Sequence card stops showing. Actual orchestration runs in the user\'s Claude Code CLI session.',
    },
  };
  const create = await request(cfg, 'POST', '/api/agents', body);
  if (create.status >= 400) {
    throw new Error('POST /api/agents failed: ' + create.status + ' ' + JSON.stringify(create.data));
  }
  return { created: true, data: create.data };
}

async function skipOnboarding(cfg) {
  const res = await request(cfg, 'POST', '/api/onboarding', { action: 'skip' });
  return { ok: res.status < 400, status: res.status };
}

function ensureGatewayOptional(cfg) {
  const envPath = cfg.mc_env_file;
  if (!fs.existsSync(envPath)) {
    throw new Error('MC .env not found at ' + envPath);
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  if (/^NEXT_PUBLIC_GATEWAY_OPTIONAL\s*=\s*true/m.test(raw)) {
    return { changed: false, reason: 'already set' };
  }
  let out;
  if (/^\s*#?\s*NEXT_PUBLIC_GATEWAY_OPTIONAL\s*=/m.test(raw)) {
    out = raw.replace(
      /^\s*#?\s*NEXT_PUBLIC_GATEWAY_OPTIONAL\s*=.*$/m,
      'NEXT_PUBLIC_GATEWAY_OPTIONAL=true'
    );
  } else {
    const sep = raw.endsWith('\n') ? '' : '\n';
    out = raw + sep + '\n# Added by mc-kit doctor --fix-onboarding\nNEXT_PUBLIC_GATEWAY_OPTIONAL=true\n';
  }
  fs.writeFileSync(envPath, out);
  return { changed: true };
}

async function onboardingStatus(cfg) {
  const status = { agents: null, skipped: null, gatewayOptional: null, errors: [] };
  try {
    const agentsRes = await request(cfg, 'GET', '/api/agents?limit=1');
    if (agentsRes.status < 400) {
      status.agents = pickList(agentsRes.data).length;
    } else {
      status.errors.push('agents: ' + agentsRes.status);
    }
  } catch (e) {
    status.errors.push('agents: ' + e.message);
  }
  try {
    const onbRes = await request(cfg, 'GET', '/api/onboarding');
    if (onbRes.status < 400 && onbRes.data && typeof onbRes.data === 'object') {
      status.skipped = !!onbRes.data.skipped;
    }
  } catch (e) {
    status.errors.push('onboarding: ' + e.message);
  }
  try {
    if (fs.existsSync(cfg.mc_env_file)) {
      const envRaw = fs.readFileSync(cfg.mc_env_file, 'utf8');
      status.gatewayOptional = /^NEXT_PUBLIC_GATEWAY_OPTIONAL\s*=\s*true/m.test(envRaw);
    }
  } catch (e) {
    status.errors.push('env: ' + e.message);
  }
  return status;
}

async function fixOnboarding(cfg, opts) {
  opts = opts || {};
  console.log('[doctor] Ensuring stub agent exists (needed by Launch Sequence card)...');
  const agent = await ensureStubAgent(cfg);
  if (agent.created) console.log('  ✓ Created "Claude Code (external)" stub agent');
  else console.log('  ✓ ' + agent.count + ' agent(s) already registered');

  console.log('[doctor] Marking onboarding wizard as skipped for api user...');
  const onb = await skipOnboarding(cfg);
  if (onb.ok) console.log('  ✓ POST /api/onboarding action=skip OK');
  else console.log('  ! endpoint returned ' + onb.status + ' (continuing; stub agent is the main fix)');

  let envTouched = false;
  if (opts.includeBanner) {
    console.log('[doctor] Patching ' + cfg.mc_env_file + ' → NEXT_PUBLIC_GATEWAY_OPTIONAL=true...');
    const env = ensureGatewayOptional(cfg);
    if (env.changed) {
      envTouched = true;
      console.log('  ✓ Added NEXT_PUBLIC_GATEWAY_OPTIONAL=true');
    } else {
      console.log('  ✓ already set');
    }
  } else {
    const envRaw = fs.existsSync(cfg.mc_env_file) ? fs.readFileSync(cfg.mc_env_file, 'utf8') : '';
    if (!/^NEXT_PUBLIC_GATEWAY_OPTIONAL\s*=\s*true/m.test(envRaw)) {
      console.log('[doctor] "No gateway detected" banner will remain.');
      console.log('         Re-run with --include-banner to also set NEXT_PUBLIC_GATEWAY_OPTIONAL=true in .env.');
    }
  }

  const state = loadState(cfg);
  state.onboarding_fixed = true;
  state.onboarding_fixed_at = new Date().toISOString();
  saveState(cfg, state);

  console.log('');
  if (envTouched) {
    console.log('Restart required to apply the .env change:');
    console.log('  mc-kit ide:stop && mc-kit ide:start');
  } else {
    console.log('Reload the dashboard tab (the stub agent hides the Launch Sequence card).');
  }
}

module.exports = { fixOnboarding, onboardingStatus, ensureStubAgent, ensureGatewayOptional, skipOnboarding };
