# OAuth Setup

This server supports OAuth 2.0 for multi-user deployments on Vercel. Sessions are stored in Vercel KV and encrypted at rest.

## 1) Create a Raindrop OAuth App

Create an app in the Raindrop developer console and collect:

- Client ID
- Client Secret
- Redirect URI: `https://your-app.vercel.app/auth/callback`

## 2) Configure Redirect Allowlist

This server enforces an allowlist for post-auth redirects via `OAUTH_ALLOWED_REDIRECT_URIS`.

Examples:

- `https://your-app.com/dashboard`
- `https://your-app.vercel.app/dashboard`
- `/dashboard` (relative paths are allowed)

## 3) Set Vercel Environment Variables

Required:

- `OAUTH_CLIENT_ID`
- `OAUTH_CLIENT_SECRET`
- `OAUTH_REDIRECT_URI`
- `OAUTH_ALLOWED_REDIRECT_URIS`
- `TOKEN_ENCRYPTION_KEY` (generate: `openssl rand -hex 32`)

Storage (required for OAuth sessions):

- Attach Vercel KV to the project; Vercel will populate `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

## 4) Run the OAuth Flow

Start:

- `https://your-app.vercel.app/auth/init?redirect_uri=/dashboard`

After Raindrop authorization, the server sets an httpOnly `mcp_session` cookie.

## 5) Calling the MCP Server

### Using an OAuth session cookie

Use an MCP client configured for Streamable HTTP with cookies enabled, pointing at:

- `https://your-app.vercel.app/mcp`

### Using a direct user token header

If you don’t want sessions, you can pass a token per request:

- `X-Raindrop-Token: <token>`

Recommended for production:

- `X-API-Key: <your API_KEY>`

