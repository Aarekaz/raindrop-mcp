#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const BASE_URL = (process.env.BASE_URL || 'https://raindrop-mcp.anuragd.me').replace(/\/+$/, '');
const REDIRECT_URI = process.env.E2E_REDIRECT_URI || 'http://localhost:8765/callback';
const TOOL_NAME = process.env.E2E_TOOL || 'collection_list';

function form(data) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      body.set(key, value);
    }
  }
  return body;
}

function wrangler(args) {
  return execFileSync('bunx', ['wrangler', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function getLoggedInUserId() {
  const raw = wrangler(['kv', 'key', 'list', '--binding', 'RAINDROP_AUTH_KV', '--remote']);
  const keys = JSON.parse(raw);
  const userKey = keys.map((key) => key.name).find((name) => /^user:\d+/.test(name));

  if (!userKey) {
    throw new Error('No Raindrop OAuth session found in KV. Open /auth/init?redirect_uri=/ once first.');
  }

  return userKey.slice('user:'.length);
}

function deleteKvKey(key) {
  try {
    wrangler(['kv', 'key', 'delete', key, '--binding', 'RAINDROP_AUTH_KV', '--remote']);
  } catch {
    // Cleanup should not hide the real E2E result.
  }
}

function parseMcpResponse(text) {
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(dataLine ? dataLine.slice(6) : text);
}

async function main() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomUUID();
  const resource = `${BASE_URL}/mcp`;
  let clientId;

  try {
    const registration = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Raindrop MCP E2E Probe',
        redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'raindrop:read raindrop:write',
      }),
    });
    if (registration.status !== 201) {
      throw new Error(`register failed: ${registration.status}`);
    }
    const client = await registration.json();
    clientId = client.client_id;

    const userId = getLoggedInUserId();
    const authorization = await fetch(`${BASE_URL}/authorize`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `raindrop_session=${userId}`,
      },
      body: form({
        action: 'approve',
        state,
        client_id: client.client_id,
        redirect_uri: REDIRECT_URI,
        code_challenge: challenge,
        scope: 'raindrop:read raindrop:write',
        resource,
      }),
    });
    if (authorization.status !== 302) {
      throw new Error(`authorize failed: ${authorization.status}`);
    }
    const location = authorization.headers.get('location');
    const code = location ? new URL(location).searchParams.get('code') : null;
    if (!code) {
      throw new Error('authorize redirect did not include code');
    }

    const tokenResponse = await fetch(`${BASE_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        grant_type: 'authorization_code',
        client_id: client.client_id,
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }),
    });
    if (tokenResponse.status !== 200) {
      throw new Error(`token failed: ${tokenResponse.status}`);
    }
    const tokenBody = await tokenResponse.json();

    const mcpResponse = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenBody.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: TOOL_NAME, arguments: {} },
      }),
    });
    if (mcpResponse.status !== 200) {
      throw new Error(`mcp failed: ${mcpResponse.status}`);
    }
    const payload = parseMcpResponse(await mcpResponse.text());
    if (payload.result?.isError) {
      throw new Error(`${TOOL_NAME} returned MCP error`);
    }

    console.log(JSON.stringify({
      baseUrl: BASE_URL,
      register: registration.status,
      authorize: authorization.status,
      token: tokenResponse.status,
      mcp: mcpResponse.status,
      tool: TOOL_NAME,
      ok: true,
    }, null, 2));
  } finally {
    if (clientId) {
      deleteKvKey(`client:${clientId}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
