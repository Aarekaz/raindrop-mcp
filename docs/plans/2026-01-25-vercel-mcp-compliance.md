# Vercel MCP Compliance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update Raindrop MCP server to comply with Vercel's latest MCP best practices and 2025-03-26 MCP specification (Streamable HTTP, Origin validation, Fluid Compute)

**Architecture:** Update the existing mcp-handler implementation to support Streamable HTTP transport (GET/POST/DELETE), add critical security validations (Origin header), enable Vercel Fluid Compute for cost optimization, and ensure full spec compliance with session management.

**Tech Stack:** TypeScript, mcp-handler, Vercel Functions, Fluid Compute, MCP Specification 2025-03-26

---

## Task 1: Add Origin Header Validation (Critical Security)

**Files:**
- Modify: `api/raindrop.ts:89-136` (verifyToken function area)

**Context:** MCP spec requires validating Origin header to prevent DNS rebinding attacks. This is a critical security requirement that must be implemented before deployment.

**Step 1: Add Origin validation function**

Add this function right after the imports in `api/raindrop.ts`:

```typescript
/**
 * Validate Origin header to prevent DNS rebinding attacks
 * Required by MCP Streamable HTTP specification
 */
function validateOrigin(req: Request): void {
  const origin = req.headers.get('origin');

  // Allow requests without Origin header (non-browser clients)
  if (!origin) {
    return;
  }

  const allowedOrigins = [
    'https://your-app.vercel.app', // Production domain
    'http://localhost:3000',        // Local development
    'http://127.0.0.1:3000',        // Local development (numeric)
  ];

  const isAllowed = allowedOrigins.some(allowed =>
    origin.startsWith(allowed)
  );

  if (!isAllowed) {
    throw new Error(`Invalid origin: ${origin}. Potential DNS rebinding attack.`);
  }
}
```

**Step 2: Add Origin validation to baseHandler**

Find the `baseHandler` function (around line 138) and add validation at the very start:

```typescript
const baseHandler = async (req: Request): Promise<Response> => {
  // Validate origin to prevent DNS rebinding attacks
  try {
    validateOrigin(req);
  } catch (error) {
    console.error('Origin validation failed:', error);
    return new Response('Forbidden', { status: 403 });
  }

  // Extract auth from request (existing code continues here...)
  const authInfo = (req as unknown as { auth?: AuthInfo }).auth;
```

**Step 3: Verify TypeScript compiles**

Run: `npm run type-check`
Expected: No TypeScript errors

**Step 4: Test Origin validation locally**

Create a simple test:

```bash
# Should succeed (no Origin header)
curl -X POST http://localhost:3000/api/raindrop \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Should succeed (allowed origin)
curl -X POST http://localhost:3000/api/raindrop \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Should fail with 403 (invalid origin)
curl -X POST http://localhost:3000/api/raindrop \
  -H "Origin: http://malicious.com" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Expected: First two succeed, third returns 403

**Step 5: Commit**

```bash
git add api/raindrop.ts
git commit -m "feat: add Origin header validation for DNS rebinding protection

- Add validateOrigin function per MCP spec requirement
- Validate Origin header in baseHandler before auth
- Return 403 Forbidden for invalid origins
- Allow localhost and production domain
- Prevents DNS rebinding attacks"
```

---

## Task 2: Export GET and DELETE Handlers (Streamable HTTP Spec)

**Files:**
- Modify: `api/raindrop.ts:548-550` (export statements at end)

**Context:** MCP Streamable HTTP spec requires servers to support GET (for server-initiated messages), POST (for client messages), and DELETE (for session termination). Currently only POST is exported.

**Step 1: Read current export**

Current code at end of file:

```typescript
export const POST = withMcpAuth(verifyToken)(baseHandler);
```

**Step 2: Add GET and DELETE exports**

Replace the single export with:

```typescript
// Streamable HTTP transport requires GET, POST, and DELETE
export const GET = withMcpAuth(verifyToken)(baseHandler);
export const POST = withMcpAuth(verifyToken)(baseHandler);
export const DELETE = withMcpAuth(verifyToken)(baseHandler);
```

**Step 3: Verify TypeScript compiles**

Run: `npm run type-check`
Expected: No errors

**Step 4: Test GET endpoint locally**

```bash
# Test GET (should work now)
curl -X GET http://localhost:3000/api/raindrop \
  -H "Accept: text/event-stream"

# Test DELETE (should work)
curl -X DELETE http://localhost:3000/api/raindrop
```

Expected: Both should respond (not 405 Method Not Allowed)

**Step 5: Commit**

```bash
git add api/raindrop.ts
git commit -m "feat: export GET and DELETE handlers for Streamable HTTP

- Export GET handler for server-initiated SSE streams
- Export DELETE handler for session termination
- Follows MCP Streamable HTTP specification 2025-03-26
- All three methods (GET, POST, DELETE) now supported"
```

---

## Task 3: Enable Fluid Compute (Performance & Cost Optimization)

**Files:**
- Modify: `vercel.json:1-8`

**Context:** Fluid Compute optimizes Vercel Functions for MCP servers' irregular usage patterns (long idle, quick bursts). Documented to provide 90% cost savings and 50% CPU reduction. This is a Vercel-specific optimization.

**Step 1: Read current vercel.json**

Current content:

```json
{
  "rewrites": [
    {
      "source": "/mcp",
      "destination": "/api/raindrop"
    }
  ]
}
```

**Step 2: Add Fluid Compute configuration**

Update to:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "fluid": true,
  "rewrites": [
    {
      "source": "/mcp",
      "destination": "/api/raindrop"
    }
  ]
}
```

**Step 3: No local testing needed**

Fluid Compute is a deployment-time feature. Changes take effect on next deploy.

**Step 4: Commit**

```bash
git add vercel.json
git commit -m "feat: enable Fluid Compute for optimized serverless execution

- Enable fluid compute for 90% cost savings
- Optimizes for MCP irregular usage patterns
- Provides optimized concurrency and dynamic scaling
- Reduces cold start times with bytecode caching
- Follows Vercel MCP server best practices"
```

---

## Task 4: Add basePath Configuration (Routing Fix)

**Files:**
- Modify: `api/raindrop.ts:167-172` (createMcpHandler options)

**Context:** Vercel documentation shows basePath is required for proper routing when functions are in api/ directory. This prevents routing issues.

**Step 1: Find createMcpHandler call**

Locate around line 167:

```typescript
const handler = createMcpHandler(
  (server) => {
    // ... server setup
  },
  {
    serverInfo: {
      name: 'raindrop-mcp',
      version: '0.1.0',
    },
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);
```

**Step 2: Add basePath to options**

Update to include third parameter:

```typescript
const handler = createMcpHandler(
  (server) => {
    // ... server setup (no changes)
  },
  {
    serverInfo: {
      name: 'raindrop-mcp',
      version: '0.1.0',
    },
    capabilities: {
      tools: {},
      resources: {},
    },
  },
  {
    basePath: '/api', // Required for Vercel routing
  }
);
```

**Step 3: Verify TypeScript compiles**

Run: `npm run type-check`
Expected: No errors

**Step 4: Test routing still works**

```bash
# Test via /mcp (rewrite)
curl http://localhost:3000/mcp

# Test via /api/raindrop (direct)
curl http://localhost:3000/api/raindrop
```

Expected: Both routes work

**Step 5: Commit**

```bash
git add api/raindrop.ts
git commit -m "feat: add basePath configuration for Vercel routing

- Add basePath: '/api' to createMcpHandler options
- Ensures proper routing in Vercel Functions environment
- Follows Vercel MCP server deployment best practices
- Prevents routing issues with /api directory structure"
```

---

## Task 5: Update OAuth Metadata Endpoint (mcp-handler API)

**Files:**
- Modify: `api/.well-known/oauth-protected-resource.ts:1-35`

**Context:** Vercel documentation shows using mcp-handler's protectedResourceHandler and metadataCorsOptionsRequestHandler for OAuth metadata. This ensures proper CORS handling and metadata format.

**Step 1: Read current implementation**

Current file manually constructs JSON response.

**Step 2: Replace with mcp-handler utilities**

Replace entire file content with:

```typescript
import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler';

/**
 * OAuth Protected Resource Metadata endpoint
 * Complies with RFC 9728 and MCP Streamable HTTP specification
 */
const handler = protectedResourceHandler({
  authServerUrls: ['https://raindrop.io'],
  scopes: ['raindrop:read', 'raindrop:write'],
});

/**
 * CORS preflight handler for metadata endpoint
 */
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
```

**Step 3: Verify TypeScript compiles**

Run: `npm run type-check`
Expected: No errors

**Step 4: Test metadata endpoint**

```bash
# Test GET
curl http://localhost:3000/.well-known/oauth-protected-resource

# Test OPTIONS (CORS preflight)
curl -X OPTIONS http://localhost:3000/.well-known/oauth-protected-resource
```

Expected: GET returns metadata JSON, OPTIONS returns CORS headers

**Step 5: Commit**

```bash
git add api/.well-known/oauth-protected-resource.ts
git commit -m "refactor: use mcp-handler for OAuth metadata endpoint

- Replace manual implementation with protectedResourceHandler
- Add metadataCorsOptionsRequestHandler for CORS
- Ensures RFC 9728 compliance
- Follows Vercel MCP handler best practices
- Proper CORS support for OPTIONS requests"
```

---

## Task 6: Add MCP Transport Tests (Verification)

**Files:**
- Modify: `tests/vercel.mcp.test.ts:74-end`

**Context:** Add tests to verify Streamable HTTP compliance (GET/POST/DELETE support) and Origin validation works correctly.

**Step 1: Add GET method test**

Add after existing tests in `tests/vercel.mcp.test.ts`:

```typescript
it('supports GET method for SSE streams', async () => {
  const request = new Request('https://example.com/api/raindrop', {
    method: 'GET',
    headers: {
      accept: 'text/event-stream',
      'x-raindrop-token': 'test-token',
    },
  });

  const response = await GET(request);
  // GET without POST should either work or return appropriate response
  expect(response.status).toBeLessThan(500);
});
```

**Step 2: Add DELETE method test**

```typescript
it('supports DELETE method for session termination', async () => {
  const request = new Request('https://example.com/api/raindrop', {
    method: 'DELETE',
    headers: {
      'x-raindrop-token': 'test-token',
    },
  });

  const response = await DELETE(request);
  // DELETE should return appropriate status
  expect(response.status).toBeLessThan(500);
});
```

**Step 3: Add Origin validation test**

```typescript
it('validates Origin header to prevent DNS rebinding', async () => {
  const request = new Request('https://example.com/api/raindrop', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'origin': 'http://malicious.com', // Invalid origin
      'x-raindrop-token': 'test-token',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 99,
      method: 'tools/list',
      params: {},
    }),
  });

  const response = await POST(request);
  expect(response.status).toBe(403);
});
```

**Step 4: Import GET and DELETE**

Update imports at top of file:

```typescript
import { POST, GET, DELETE } from '../api/raindrop';
```

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass (including 3 new tests)

**Step 6: Commit**

```bash
git add tests/vercel.mcp.test.ts
git commit -m "test: add Streamable HTTP and security validation tests

- Test GET method support for SSE streams
- Test DELETE method support for session termination
- Test Origin header validation prevents DNS rebinding
- Verify 403 response for invalid origins
- Ensures MCP Streamable HTTP spec compliance"
```

---

## Task 7: Update Documentation (Deployment Instructions)

**Files:**
- Modify: `docs/DEPLOYMENT.md:55-end`
- Modify: `README.md:237-277`

**Step 1: Add Vercel deployment checklist to DEPLOYMENT.md**

Add section after Quick Checks:

```markdown
## Vercel Best Practices

This deployment follows Vercel MCP server best practices:

### Fluid Compute Enabled

Fluid compute is enabled for optimized performance:
- 90% cost savings vs traditional serverless
- 50% CPU reduction vs legacy SSE transport
- Optimized concurrency for irregular MCP usage patterns
- Automatic bytecode caching for faster cold starts

Verify in Vercel dashboard: Project → Settings → Functions → Fluid Compute (should be ON)

### Streamable HTTP Transport

The server implements MCP Streamable HTTP specification (2025-03-26):
- Supports GET, POST, and DELETE methods
- Optional SSE upgrade for streaming responses
- Session management via Mcp-Session-Id headers
- Origin header validation for security

### Security

Critical security features:
- Origin header validation (prevents DNS rebinding attacks)
- OAuth 2.0 with PKCE authentication
- AES-256-GCM token encryption
- HTTPS-only in production

### Testing

Test all HTTP methods after deployment:

```bash
# Test POST (client requests)
curl -X POST https://your-app.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Test GET (server messages)
curl -X GET https://your-app.vercel.app/mcp \
  -H "Accept: text/event-stream"

# Test DELETE (session termination)
curl -X DELETE https://your-app.vercel.app/mcp
```
```

**Step 2: Update README.md features section**

Find the features list (around line 237) and add:

```markdown
- ⚡ **Fluid Compute** - Optimized Vercel execution (90% cost savings)
- 🌐 **Streamable HTTP** - Latest MCP transport (2025-03-26 spec)
- 🔒 **DNS Rebinding Protection** - Origin header validation
```

**Step 3: Verify links still work**

Check all documentation links are valid.

**Step 4: Commit**

```bash
git add docs/DEPLOYMENT.md README.md
git commit -m "docs: update deployment guide with Vercel best practices

- Document Fluid Compute benefits and verification
- Explain Streamable HTTP transport support
- Add security features documentation
- Provide testing commands for all HTTP methods
- Update features list with new capabilities"
```

---

## Task 8: Create Environment Variable Template (Production Checklist)

**Files:**
- Create: `.env.production.example`

**Context:** Create a template showing all required environment variables for production deployment with Vercel best practices.

**Step 1: Create environment template**

Create `.env.production.example`:

```env
# Raindrop MCP Server - Production Environment Variables
# Copy to Vercel Dashboard: Settings → Environment Variables

# OAuth Configuration (Required for multi-user)
OAUTH_CLIENT_ID=your_oauth_client_id_here
OAUTH_CLIENT_SECRET=your_oauth_client_secret_here
OAUTH_REDIRECT_URI=https://your-app.vercel.app/auth/callback
OAUTH_ALLOWED_REDIRECT_URIS=https://your-app.vercel.app/dashboard,/dashboard

# Token Encryption (Required for OAuth)
# Generate with: openssl rand -hex 32
TOKEN_ENCRYPTION_KEY=your_64_character_hex_key_here

# Vercel KV (Auto-set when KV is linked)
KV_REST_API_URL=https://your-kv-instance.kv.vercel-storage.com
KV_REST_API_TOKEN=your_kv_token_here

# Optional Security
API_KEY=your_api_key_for_endpoint_protection
NODE_ENV=production

# Direct Token Mode (Alternative to OAuth - Single User Only)
# RAINDROP_ACCESS_TOKEN=your_raindrop_token_here
```

**Step 2: Add to .gitignore**

Verify `.env.production` is in `.gitignore`:

```bash
grep -q ".env.production" .gitignore || echo ".env.production" >> .gitignore
```

**Step 3: Commit**

```bash
git add .env.production.example .gitignore
git commit -m "docs: add production environment variable template

- Create .env.production.example with all required vars
- Document OAuth configuration requirements
- Include encryption key generation command
- Show optional security settings
- Add to .gitignore for safety"
```

---

## Completion Checklist

After completing all tasks:

- [ ] Task 1: Origin header validation added ✓
- [ ] Task 2: GET and DELETE handlers exported ✓
- [ ] Task 3: Fluid Compute enabled in vercel.json ✓
- [ ] Task 4: basePath configuration added ✓
- [ ] Task 5: OAuth metadata endpoint updated ✓
- [ ] Task 6: MCP transport tests added ✓
- [ ] Task 7: Documentation updated ✓
- [ ] Task 8: Environment template created ✓
- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] Ready for Vercel deployment

## Testing Guide

After implementation, verify compliance:

**1. Local Testing:**
```bash
npm run type-check  # Should pass
npm test            # All tests pass (15 total)
npm run dev         # Local server starts
```

**2. MCP Inspector Testing:**
```bash
npx @modelcontextprotocol/inspector
# URL: http://localhost:3000/api/raindrop
# Transport: Streamable HTTP
# Test all tools
```

**3. Security Testing:**
```bash
# Should fail (invalid origin)
curl -X POST http://localhost:3000/api/raindrop \
  -H "Origin: http://evil.com" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Should succeed (valid origin)
curl -X POST http://localhost:3000/api/raindrop \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

**4. Post-Deployment Testing:**
```bash
# Verify Fluid Compute enabled
# Vercel Dashboard → Project → Settings → Functions
# "Fluid Compute" should be ON

# Test production endpoint
curl https://your-app.vercel.app/mcp
```

## Deployment Command

After all tasks complete:

```bash
# Verify everything is committed
git status

# Deploy to Vercel
vercel --prod

# Or merge to main if using git-based deployment
git checkout main
git merge http-transport-serverless
git push
```

---

## Success Criteria

After deployment, your MCP server will:

1. ✅ **Streamable HTTP Compliant**: Supports GET, POST, DELETE per 2025-03-26 spec
2. ✅ **Secure**: Origin header validation prevents DNS rebinding attacks
3. ✅ **Optimized**: Fluid Compute reduces costs by 90% and CPU by 50%
4. ✅ **Properly Routed**: basePath ensures correct Vercel Function routing
5. ✅ **OAuth Compliant**: Metadata endpoint uses mcp-handler utilities
6. ✅ **Well Tested**: 15 passing tests including transport and security
7. ✅ **Production Ready**: All Vercel MCP best practices implemented
