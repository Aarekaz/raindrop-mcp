# Security and API Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 8 critical security and API bugs in the Raindrop MCP server

**Architecture:** The fixes address three categories:
1. Security: Remove exposed API token from git-tracked config
2. OAuth: Fix state retrieval timing bug in callback handlers
3. API: Correct method signatures in Vercel API tool handlers

**Tech Stack:** TypeScript, Vercel Functions, OAuth 2.0 PKCE, Raindrop.io API

---

## Task 1: Remove Hardcoded API Token (BUG-0001)

**Files:**
- Modify: `claude-desktop-config.json:7`
- Create: `claude-desktop-config.example.json`
- Create: `.gitignore` (or modify if exists)

**Step 1: Verify current git status**

Run: `git status`
Expected: See if claude-desktop-config.json is tracked

**Step 2: Remove sensitive token from config**

In `claude-desktop-config.json`, replace the hardcoded token:

```json
{
  "mcpServers": {
    "raindrop": {
      "command": "node",
      "args": ["/Users/aarekaz/Development/raindrop-mcp/build/index.js"],
      "env": {
        "RAINDROP_ACCESS_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

**Step 3: Create example config file**

Create `claude-desktop-config.example.json`:

```json
{
  "mcpServers": {
    "raindrop": {
      "command": "node",
      "args": ["/path/to/raindrop-mcp/build/index.js"],
      "env": {
        "RAINDROP_ACCESS_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

**Step 4: Update .gitignore**

Add to `.gitignore`:

```
# Local configuration with secrets
claude-desktop-config.json
```

**Step 5: Remove from git history**

Run: `git rm --cached claude-desktop-config.json`
Expected: File removed from index but preserved locally

**Step 6: Commit changes**

```bash
git add .gitignore claude-desktop-config.example.json
git commit -m "security: remove hardcoded API token from config

- Add claude-desktop-config.json to .gitignore
- Create example config file for documentation
- Remove real config from git tracking"
```

---

## Task 2: Fix OAuth State Retrieval in Vercel Callback (BUG-0002)

**Files:**
- Modify: `api/auth/callback.ts:50-61`

**Step 1: Read current implementation**

Run: `cat api/auth/callback.ts | grep -A 15 "handleCallback"`
Expected: See that state retrieval happens AFTER handleCallback which deletes state

**Step 2: Retrieve redirectUri before handleCallback**

Replace lines 50-61 in `api/auth/callback.ts`:

```typescript
    // SECURITY FIX: Retrieve redirect_uri from stored OAuthState BEFORE handling callback
    // The handleCallback method deletes the state, so we must get redirectUri first
    const storedOAuthState = await oauthService['storage'].getOAuthState(state);
    const redirectUri = storedOAuthState?.redirectUri || '/';

    // Exchange code for tokens
    const session = await oauthService.handleCallback(code, state);

    // Set session cookie
    res.setHeader('Set-Cookie', [
      `mcp_session=${session.sessionId}; HttpOnly; Secure; SameSite=Lax; Max-Age=${14 * 24 * 60 * 60}; Path=/`,
      `oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/` // Clear state cookie
    ]);

    // Redirect to the stored redirect URI (session_id already in httpOnly cookie)
    return res.redirect(redirectUri);
```

**Step 3: Verify the fix logic**

The fix ensures:
1. redirectUri retrieved BEFORE state deletion
2. No session_id in URL (security fix maintained)
3. Fallback to '/' if no redirectUri found

**Step 4: Commit the fix**

```bash
git add api/auth/callback.ts
git commit -m "fix: retrieve OAuth redirectUri before state deletion

- Move getOAuthState call before handleCallback
- handleCallback deletes the state, causing redirectUri to be null
- Prevents redirect failures in OAuth flow"
```

---

## Task 3: Fix OAuth State Retrieval in Express Routes (BUG-0003)

**Files:**
- Modify: `src/oauth/oauth.routes.ts:133-157`

**Step 1: Read current implementation**

Run: `cat src/oauth/oauth.routes.ts | grep -A 25 "router.get('/auth/callback'"`
Expected: Same issue as BUG-0002 but in Express route

**Step 2: Retrieve redirectUri before handleCallback**

Replace lines 133-157 in `src/oauth/oauth.routes.ts`:

```typescript
      const session = await oauthService.handleCallback(
        code as string,
        state as string
      );

      // Set session cookie
      res.cookie('mcp_session', session.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        path: '/',
      });

      // Clear OAuth state cookie
      res.clearCookie('oauth_state');

      // SECURITY FIX: Retrieve redirect_uri from stored OAuthState (not query param)
      // This prevents attackers from changing the redirect target
      const storedState = await oauthService['storage'].getOAuthState(state as string);
      const redirectUri = storedState?.redirectUri || '/';

      // SECURITY FIX: Remove session_id from URL (already in httpOnly cookie)
      // Session ID in URL leaks credentials via browser history, logs, and Referer headers
      res.redirect(redirectUri);
```

with:

```typescript
      // SECURITY FIX: Retrieve redirect_uri from stored OAuthState BEFORE handling callback
      // The handleCallback method deletes the state, so we must get redirectUri first
      const storedState = await oauthService['storage'].getOAuthState(state as string);
      const redirectUri = storedState?.redirectUri || '/';

      const session = await oauthService.handleCallback(
        code as string,
        state as string
      );

      // Set session cookie
      res.cookie('mcp_session', session.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        path: '/',
      });

      // Clear OAuth state cookie
      res.clearCookie('oauth_state');

      // Redirect to the stored redirect URI (session_id already in httpOnly cookie)
      res.redirect(redirectUri);
```

**Step 3: Commit the fix**

```bash
git add src/oauth/oauth.routes.ts
git commit -m "fix: retrieve OAuth redirectUri before state deletion in Express routes

- Move getOAuthState call before handleCallback
- Same issue as Vercel callback handler
- Ensures redirectUri is available after state deletion"
```

---

## Task 4: Fix createBookmark Method Call (BUG-0004)

**Files:**
- Modify: `api/raindrop.ts:220-227`

**Step 1: Identify incorrect call**

Run: `grep -A 8 "case 'create':" api/raindrop.ts | grep -A 8 "createBookmark"`
Expected: See single object argument instead of two separate arguments

**Step 2: Fix method signature**

In `api/raindrop.ts:220-227`, replace:

```typescript
              const created = await raindropService.createBookmark({
                link: args.link,
                collectionId: args.collectionId,
                title: args.title,
                excerpt: args.excerpt,
                tags: args.tags,
                important: args.important,
              });
```

with:

```typescript
              const created = await raindropService.createBookmark(
                args.collectionId || -1, // -1 = Unsorted
                {
                  link: args.link,
                  title: args.title,
                  excerpt: args.excerpt,
                  tags: args.tags,
                  important: args.important,
                }
              );
```

**Step 3: Verify method signature**

Run: `grep -A 8 "async createBookmark" src/services/raindrop.service.ts`
Expected: Confirm it expects `(collectionId: number, bookmark: {...})`

**Step 4: Commit the fix**

```bash
git add api/raindrop.ts
git commit -m "fix: correct createBookmark method call signature

- Split collectionId as first argument
- Pass bookmark properties as second object argument
- Matches RaindropService.createBookmark signature
- Use -1 (Unsorted) as default if collectionId not provided"
```

---

## Task 5: Fix createHighlight Method Call (BUG-0005)

**Files:**
- Modify: `api/raindrop.ts:280-285`

**Step 1: Identify incorrect call**

Run: `grep -A 6 "case 'create':" api/raindrop.ts | grep -B 2 -A 4 "createHighlight"`
Expected: See four separate arguments instead of two-argument structure

**Step 2: Fix method signature**

In `api/raindrop.ts:280-285`, replace:

```typescript
              const created = await raindropService.createHighlight(
                args.raindropId,
                args.text,
                args.color,
                args.note
              );
```

with:

```typescript
              const created = await raindropService.createHighlight(
                args.raindropId,
                {
                  text: args.text,
                  color: args.color,
                  note: args.note,
                }
              );
```

**Step 3: Verify method signature**

Run: `grep -A 8 "async createHighlight" src/services/raindrop.service.ts`
Expected: Confirm it expects `(bookmarkId: number, highlight: {text, note?, color?})`

**Step 4: Commit the fix**

```bash
git add api/raindrop.ts
git commit -m "fix: correct createHighlight method call signature

- Pass highlight properties as second object argument
- Matches RaindropService.createHighlight signature
- Groups text, color, note into highlight object"
```

---

## Task 6: Fix getFilters Method Call (BUG-0006)

**Files:**
- Modify: `api/raindrop.ts:327`

**Step 1: Identify incorrect call**

Run: `grep -A 2 "bookmark_statistics" api/raindrop.ts`
Expected: See two separate arguments instead of options object

**Step 2: Fix method signature**

In `api/raindrop.ts:327`, replace:

```typescript
          const stats = await raindropService.getFilters(args.collectionId, args.search);
```

with:

```typescript
          const stats = await raindropService.getFilters(
            args.collectionId,
            {
              search: args.search,
              tagsSort: args.tagsSort,
            }
          );
```

**Step 3: Verify method signature**

Run: `grep -A 8 "async getFilters" src/services/raindrop.service.ts`
Expected: Confirm it expects `(collectionId: number, options: {tagsSort?, search?})`

**Step 4: Commit the fix**

```bash
git add api/raindrop.ts
git commit -m "fix: correct getFilters method call signature

- Pass search and tagsSort as options object
- Matches RaindropService.getFilters signature
- Enables proper filter statistics retrieval"
```

---

## Task 7: Fix Bulk Edit Collection ID Logic (BUG-0007)

**Files:**
- Modify: `api/raindrop.ts:310-318`

**Step 1: Identify incorrect fallback**

Run: `grep -A 8 "bulk_edit_bookmarks" api/raindrop.ts`
Expected: See `args.ids[0]` used as collectionId fallback (bookmark ID, not collection ID)

**Step 2: Fix collection ID logic**

In `api/raindrop.ts:310-318`, replace:

```typescript
        async (args: any) => {
          if (!args.ids || args.ids.length === 0) {
            throw new Error('ids array required');
          }
          // BulkEditInputSchema expects collectionId in updates
          const collectionId = args.updates?.collectionId || args.ids[0]; // fallback
          await raindropService.bulkUpdateBookmarks(collectionId, args.updates);
          return { content: [textContent(`Bulk updated ${args.ids.length} bookmarks`)] };
        }
```

with:

```typescript
        async (args: any) => {
          if (!args.ids || args.ids.length === 0) {
            throw new Error('ids array required');
          }
          if (!args.collectionId) {
            throw new Error('collectionId required for bulk operations');
          }

          const updates: Record<string, any> = { ids: args.ids };
          if (args.important !== undefined) updates.important = args.important;
          if (args.tags !== undefined) updates.tags = args.tags;
          if (args.media !== undefined) updates.media = args.media;
          if (args.cover) updates.cover = args.cover;
          if (args.moveToCollection) updates.collection = { $id: args.moveToCollection };

          const result = await raindropService.bulkUpdateBookmarks(args.collectionId, updates);
          return { content: [textContent(`Bulk updated ${result.modified} bookmarks`)] };
        }
```

**Step 3: Verify method signature**

Run: `grep -A 15 "async bulkUpdateBookmarks" src/services/raindrop.service.ts`
Expected: Confirm it expects `(collectionId: number, updates: {...})`

**Step 4: Commit the fix**

```bash
git add api/raindrop.ts
git commit -m "fix: require collectionId for bulk bookmark operations

- Remove incorrect fallback to bookmark ID
- Require explicit collectionId parameter
- Build updates object with all optional fields
- Return actual modified count from service"
```

---

## Task 8: Update BulkEditInputSchema (Optional Enhancement)

**Files:**
- Create: `src/types/raindrop-zod.schemas.ts` (if doesn't exist)
- Modify: `src/types/raindrop-zod.schemas.ts` (if exists)

**Step 1: Check if schema file exists**

Run: `ls -la src/types/raindrop-zod.schemas.ts`
Expected: Either file exists or not found error

**Step 2: Find and read the schema file**

Run: `grep -r "BulkEditInputSchema" src/`
Expected: Find where schema is defined

**Step 3: Update schema to match API expectations**

Ensure `BulkEditInputSchema` includes:

```typescript
export const BulkEditInputSchema = z.object({
  ids: z.array(z.number()).min(1).describe('Array of bookmark IDs to update'),
  collectionId: z.number().describe('Collection ID where bookmarks reside'),
  important: z.boolean().optional().describe('Mark bookmarks as important'),
  tags: z.array(z.string()).optional().describe('Update bookmark tags'),
  media: z.array(z.string()).optional().describe('Update media URLs'),
  cover: z.string().optional().describe('Update cover image URL'),
  moveToCollection: z.number().optional().describe('Move bookmarks to different collection'),
});
```

**Step 4: Commit schema update (if modified)**

```bash
git add src/types/raindrop-zod.schemas.ts
git commit -m "fix: update BulkEditInputSchema to require collectionId

- Add collectionId as required field
- Align schema with API handler expectations
- Improve field descriptions"
```

---

## Task 9: Build and Verify Fixes

**Files:**
- Build output: `build/`

**Step 1: Clean previous build**

Run: `rm -rf build/`
Expected: Clean slate for new build

**Step 2: Rebuild TypeScript**

Run: `npm run build` or `tsc`
Expected: No TypeScript errors, successful compilation

**Step 3: Verify no compilation errors**

Check console output for:
- Type mismatches (should be resolved)
- Missing property errors (should be resolved)

**Step 4: Run type checking explicitly**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit build changes if needed**

If build config changed:
```bash
git add tsconfig.json package.json
git commit -m "chore: update build configuration for fixes"
```

---

## Task 10: Update Documentation

**Files:**
- Create or Modify: `README.md`
- Create: `SECURITY.md`

**Step 1: Document configuration setup**

Add to README.md:

```markdown
## Configuration

1. Copy the example config:
   ```bash
   cp claude-desktop-config.example.json claude-desktop-config.json
   ```

2. Get your Raindrop.io access token:
   - Visit https://app.raindrop.io/settings/integrations
   - Create a new app or use test token
   - Copy the access token

3. Update `claude-desktop-config.json`:
   - Replace `YOUR_TOKEN_HERE` with your actual token
   - Update the path to your build directory

**Security Note:** Never commit `claude-desktop-config.json` to git.
```

**Step 2: Create security documentation**

Create `SECURITY.md`:

```markdown
# Security Policy

## Reporting Security Issues

If you discover a security vulnerability, please email [your-email] or open a private security advisory.

## Security Best Practices

### Configuration Security

- **Never commit** `claude-desktop-config.json` to version control
- Use environment variables for production deployments
- Rotate access tokens periodically

### OAuth Security

- State parameters are validated for CSRF protection
- Tokens stored in httpOnly cookies (not URL parameters)
- Redirect URIs validated against allowlist
- PKCE flow prevents authorization code interception

### Known Security Fixes

- 2026-01-24: Removed hardcoded API token from config
- 2026-01-24: Fixed OAuth state timing issues
- 2026-01-24: Prevented session ID exposure in URLs
```

**Step 3: Commit documentation**

```bash
git add README.md SECURITY.md
git commit -m "docs: add configuration and security documentation

- Document proper config setup process
- Explain security best practices
- List known security fixes"
```

---

## Task 11: Final Testing and Validation

**Files:**
- All modified files

**Step 1: Test OAuth flow (if environment available)**

Manual test steps:
1. Start local server
2. Navigate to `/auth/init?redirect_uri=/dashboard`
3. Complete OAuth authorization
4. Verify redirect to `/dashboard` works
5. Check that no session_id in URL

**Step 2: Test bookmark creation API**

If test environment available:
```typescript
// Should work now with corrected signature
await raindropService.createBookmark(-1, {
  link: 'https://example.com',
  title: 'Test Bookmark'
});
```

**Step 3: Test bulk operations**

```typescript
// Should require collectionId now
await raindropService.bulkUpdateBookmarks(12345, {
  ids: [1, 2, 3],
  important: true
});
```

**Step 4: Review all changes**

Run: `git log --oneline --graph --decorate -10`
Expected: See all 8-11 commits in logical order

**Step 5: Create summary of fixes**

Document what was fixed:
- 1 security issue (exposed token)
- 2 OAuth timing bugs (state deletion)
- 5 API signature bugs (method calls)

---

## Completion Checklist

- [ ] Task 1: Hardcoded API token removed and gitignored
- [ ] Task 2: Vercel callback OAuth state fixed
- [ ] Task 3: Express routes OAuth state fixed
- [ ] Task 4: createBookmark signature corrected
- [ ] Task 5: createHighlight signature corrected
- [ ] Task 6: getFilters signature corrected
- [ ] Task 7: Bulk edit collectionId logic fixed
- [ ] Task 8: Schema updated (if applicable)
- [ ] Task 9: TypeScript builds without errors
- [ ] Task 10: Documentation updated
- [ ] Task 11: Manual testing completed (if environment available)
- [ ] All commits follow conventional commit format
- [ ] No breaking changes introduced

---

## DRY / YAGNI / TDD Notes

**DRY (Don't Repeat Yourself):**
- OAuth state retrieval fix applied to both Vercel and Express handlers
- Same pattern used for all method signature fixes

**YAGNI (You Aren't Gonna Need It):**
- No additional features added
- Only fixing existing bugs
- No premature abstractions

**TDD (Test Driven Development):**
- Type checking serves as compile-time tests
- Manual testing validates OAuth flow
- Future: Add unit tests for OAuth service

---

## Risk Assessment

**Low Risk:**
- Token removal (breaking change requires manual config update)
- OAuth state fix (improves correctness, no breaking changes)
- Method signature fixes (corrects runtime errors)

**Medium Risk:**
- Bulk edit now requires collectionId (breaking change for consumers)

**Mitigation:**
- Document breaking changes in commit messages
- Update examples and documentation
- Version bump if published as package
