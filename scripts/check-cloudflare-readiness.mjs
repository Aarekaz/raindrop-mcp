#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BASE_URL = (process.env.BASE_URL || 'https://raindrop-mcp.anuragd.me').replace(
  /\/+$/,
  ''
);
const READINESS_TOKEN = process.env.RAINDROP_TOKEN || 'test-token';

const REQUIRED_SECRETS = [
  'JWT_SIGNING_KEY',
  'OAUTH_ALLOWED_REDIRECT_URIS',
  'OAUTH_CLIENT_ID',
  'OAUTH_CLIENT_SECRET',
  'OAUTH_REDIRECT_URI',
  'TOKEN_ENCRYPTION_KEY',
];

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message) {
  console.error(`FAIL ${message}`);
}

async function getJson(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await response.json().catch(() => null);

  return { response, body };
}

async function listSecrets() {
  const { stdout } = await execFileAsync('bunx', ['wrangler', 'secret', 'list'], {
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function main() {
  console.log(`Checking ${BASE_URL}`);

  let ready = true;
  const secrets = await listSecrets();
  const secretNames = new Set(secrets.map((secret) => secret.name));
  const missingSecrets = REQUIRED_SECRETS.filter((name) => !secretNames.has(name));

  if (missingSecrets.length === 0) {
    pass('all required Worker secrets are set');
  } else {
    ready = false;
    fail(`missing Worker secrets: ${missingSecrets.join(', ')}`);
  }

  const health = await getJson('/health');
  if (health.response.status === 200 && health.body?.status === 'ok') {
    pass('/health returns status ok');
  } else {
    ready = false;
    fail(`/health returned ${health.response.status}`);
  }

  const authMetadata = await getJson('/.well-known/oauth-authorization-server?probe=readiness');
  if (
    authMetadata.response.status === 200 &&
    authMetadata.body?.issuer === BASE_URL &&
    authMetadata.body?.authorization_endpoint === `${BASE_URL}/authorize`
  ) {
    pass('authorization metadata matches BASE_URL');
  } else {
    ready = false;
    fail('authorization metadata does not match BASE_URL');
  }

  const protectedResource = await getJson('/.well-known/oauth-protected-resource?probe=readiness');
  if (
    protectedResource.response.status === 200 &&
    protectedResource.body?.resource === `${BASE_URL}/mcp` &&
    protectedResource.body?.authorization_servers?.includes(BASE_URL)
  ) {
    pass('protected resource metadata matches BASE_URL');
  } else {
    ready = false;
    fail('protected resource metadata does not match BASE_URL');
  }

  const unauthenticatedMcp = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  if (unauthenticatedMcp.status === 401) {
    pass('unauthenticated MCP request is rejected');
  } else {
    ready = false;
    fail(`unauthenticated MCP request returned ${unauthenticatedMcp.status}`);
  }

  const tools = await getJson('/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'X-Raindrop-Token': READINESS_TOKEN,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  if (tools.response.status === 200 && Array.isArray(tools.body?.result?.tools)) {
    pass('MCP tools/list works with direct request-token auth');
  } else {
    ready = false;
    fail(`MCP tools/list returned ${tools.response.status}`);
  }

  const authInit = await fetch(`${BASE_URL}/auth/init?redirect_uri=/dashboard`, {
    redirect: 'manual',
  });
  if (missingSecrets.includes('OAUTH_CLIENT_ID') || missingSecrets.includes('OAUTH_CLIENT_SECRET')) {
    const body = await authInit.json().catch(() => null);
    if (authInit.status === 503 && body?.error === 'oauth_not_configured') {
      pass('OAuth init fails closed while Raindrop app credentials are missing');
    } else {
      ready = false;
      fail(`OAuth init did not fail closed; got ${authInit.status}`);
    }
  } else if (authInit.status >= 300 && authInit.status < 400) {
    pass('OAuth init redirects when OAuth credentials are configured');
  } else {
    ready = false;
    fail(`OAuth init returned ${authInit.status}`);
  }

  if (!ready) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
