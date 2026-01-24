# API Field and Operation Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 2 critical API bugs preventing bookmark creation and suggestion features from working

**Architecture:** The fixes correct field name mismatches between Zod schemas and API handlers, and add missing operation handler for the suggest feature that already exists in the service layer.

**Tech Stack:** TypeScript, Zod schemas, Vercel Functions, Raindrop.io API

---

## Task 1: Fix 'url' vs 'link' Field Mismatch (BUG-1)

**Files:**
- Modify: `api/raindrop.ts:219`
- Modify: `api/raindrop.ts:223`

**The Bug:**
- Schema defines field as `url` (line 51 in `src/types/raindrop-zod.schemas.ts`)
- Handler checks `args.link` and uses `link: args.link`
- Result: Bookmark creation ALWAYS fails with "link required for create" error

**Step 1: Read current implementation to confirm the bug**

Run: `grep -A 15 "case 'create':" api/raindrop.ts | head -20`
Expected: See `if (!args.link)` on line 219 and `link: args.link` on line 223

**Step 2: Verify the schema field name**

Run: `grep -A 10 "BookmarkInputSchema" src/types/raindrop-zod.schemas.ts | head -15`
Expected: See `url: z.string().url()` at line 51

**Step 3: Fix the field name mismatch**

In `api/raindrop.ts`, make these changes:

Line 219 - Change the validation check:
```typescript
// Before:
if (!args.link) throw new Error('link required for create');

// After:
if (!args.url) throw new Error('url required for create');
```

Line 223 - Change the field mapping:
```typescript
// Before:
link: args.link,

// After:
link: args.url,
```

**Explanation:** The schema expects `url` but we need to pass `link` to the Raindrop API service (which uses the Raindrop API that expects `link`). So we validate `args.url` (from schema) and map it to `link` (for API).

**Step 4: Test the fix logic**

The fix ensures:
1. Handler validates the field that actually exists in the schema (`args.url`)
2. Maps it correctly to what the Raindrop service expects (`link: args.url`)
3. Error message is accurate ("url required" matches the schema field)

**Step 5: Commit the fix**

```bash
git add api/raindrop.ts
git commit -m "fix: correct url field name in bookmark creation handler

- Change args.link to args.url to match BookmarkInputSchema
- Schema defines 'url' field but handler was checking 'link'
- Fixes bookmark creation always failing with 'link required' error"
```

---

## Task 2: Add Missing 'suggest' Operation Handler (BUG-2)

**Files:**
- Modify: `api/raindrop.ts:217-258` (add new case in switch statement)

**The Bug:**
- Schema allows `'suggest'` operation (line 60 in `src/types/raindrop-zod.schemas.ts`)
- Service has `getSuggestions()` method (line 244 in `src/services/raindrop.service.ts`)
- Handler has no case for `'suggest'` operation
- Result: Users get "Unknown operation: suggest" error

**Step 1: Read current switch statement**

Run: `grep -A 45 "'bookmark_manage'" api/raindrop.ts | grep -A 40 "switch (args.operation)"`
Expected: See only `create`, `update`, `delete` cases - no `suggest` case

**Step 2: Verify the service method exists**

Run: `grep -A 10 "getSuggestions" src/services/raindrop.service.ts`
Expected: See method signature `async getSuggestions(link: string)`

**Step 3: Add the suggest operation handler**

In `api/raindrop.ts`, add a new case BEFORE the `delete` case (after `update` case, around line 250):

```typescript
            case 'suggest':
              if (!args.url) throw new Error('url required for suggest');
              const suggestions = await raindropService.getSuggestions(args.url);

              // Format suggestions for display
              const suggestionText = [];
              if (suggestions.collections && suggestions.collections.length > 0) {
                const collectionIds = suggestions.collections.map(c => c.$id).join(', ');
                suggestionText.push(`Suggested collections: ${collectionIds}`);
              }
              if (suggestions.tags && suggestions.tags.length > 0) {
                suggestionText.push(`Suggested tags: ${suggestions.tags.join(', ')}`);
              }
              if (suggestionText.length === 0) {
                suggestionText.push('No suggestions available for this URL');
              }

              return {
                content: [textContent(suggestionText.join('\n'))],
              };
```

**Step 4: Verify the placement**

The switch statement should now have this order:
1. `case 'create':`
2. `case 'update':`
3. `case 'suggest':` ← NEW
4. `case 'delete':`
5. `default:`

**Step 5: Test the logic**

The suggest handler:
1. Validates `url` field exists (consistent with Task 1)
2. Calls the existing `getSuggestions()` service method
3. Formats the response with collection IDs and tags
4. Provides clear output when no suggestions are available

**Step 6: Commit the fix**

```bash
git add api/raindrop.ts
git commit -m "fix: add missing suggest operation handler for bookmarks

- Implement suggest case in bookmark_manage switch statement
- Uses existing getSuggestions service method
- Returns AI-powered collection and tag suggestions for URLs
- Fixes 'Unknown operation: suggest' error"
```

---

## Task 3: Improve Vercel Rewrite Configuration (Optional Enhancement)

**Files:**
- Modify: `vercel.json:8-10`

**The Issue:**
- Catch-all rewrite `"/(.+)"` is confusing and unnecessary
- OAuth endpoints work correctly (routes match filesystem first) but configuration is fragile
- Better to be explicit about what routes to the MCP handler

**Step 1: Read current rewrites configuration**

Run: `cat vercel.json | grep -A 5 '"rewrites"'`
Expected: See catch-all pattern `"/(.+)"` routing to `/api/raindrop`

**Step 2: Remove the catch-all rewrite (optional)**

In `vercel.json`, replace the rewrites section:

Before (lines 2-11):
```json
  "rewrites": [
    {
      "source": "/mcp",
      "destination": "/api/raindrop"
    },
    {
      "source": "/(.+)",
      "destination": "/api/raindrop"
    }
  ],
```

After:
```json
  "rewrites": [
    {
      "source": "/mcp",
      "destination": "/api/raindrop"
    }
  ],
```

**Rationale:**
- OAuth endpoints (`/api/auth/init`, `/api/auth/callback`) work via filesystem routing (no rewrite needed)
- MCP endpoint explicitly routed via `/mcp` → `/api/raindrop`
- Catch-all was never needed and adds confusion

**Step 3: Verify OAuth endpoints still work**

The OAuth endpoints will continue to work because Vercel's routing order is:
1. Filesystem (API routes) - `/api/auth/*` matches here ✓
2. Rewrites - Only `/mcp` is rewritten

**Step 4: Commit the improvement (optional)**

```bash
git add vercel.json
git commit -m "refactor: remove unnecessary catch-all rewrite rule

- Keep explicit /mcp rewrite to /api/raindrop
- Remove confusing /(.+) catch-all pattern
- OAuth endpoints work via filesystem routing
- Makes routing behavior more explicit and maintainable"
```

---

## Task 4: Build and Verify Fixes

**Files:**
- Build output: `build/`

**Step 1: Run TypeScript type checking**

Run: `npx tsc --noEmit`
Expected: Pre-existing errors (47) remain, but no NEW errors from our changes

**Step 2: Build the project**

Run: `npm run build` or `bun run build`
Expected: Successful compilation

**Step 3: Verify the fixes make sense**

Check the logic:
- ✓ `args.url` matches schema field definition
- ✓ `link: args.url` correctly maps schema field to API parameter
- ✓ `suggest` case added with proper error handling
- ✓ All operations now have handlers (create, update, delete, suggest)

**Step 4: Report success**

If build succeeds, report:
- TypeScript compilation: SUCCESS
- No new type errors introduced
- All fixes applied correctly

---

## Task 5: Update Documentation (Optional)

**Files:**
- Modify: `README.md` or relevant docs (if needed)

**Step 1: Check if suggest operation is documented**

Run: `grep -i "suggest" README.md docs/*.md`
Expected: May or may not be documented

**Step 2: Add documentation if missing**

If the `suggest` operation is not documented, add an example to the relevant documentation:

```markdown
### Get AI-Powered Suggestions

Get collection and tag suggestions for a URL before saving:

```json
{
  "operation": "suggest",
  "url": "https://example.com/article"
}
```

Returns suggested collections and tags based on AI analysis of the URL content.
```

**Step 3: Commit documentation (if added)**

```bash
git add README.md
git commit -m "docs: add bookmark suggest operation example

- Document AI-powered suggestion feature
- Show how to get collection and tag suggestions for URLs"
```

---

## Completion Checklist

- [ ] Task 1: url/link field mismatch fixed
- [ ] Task 2: suggest operation handler added
- [ ] Task 3: Vercel rewrites simplified (optional)
- [ ] Task 4: TypeScript builds without new errors
- [ ] Task 5: Documentation updated (if needed)
- [ ] All commits follow conventional commit format
- [ ] No breaking changes introduced

---

## DRY / YAGNI / TDD Notes

**DRY (Don't Repeat Yourself):**
- Reuse existing `getSuggestions()` service method
- Same error message pattern across all operations

**YAGNI (You Aren't Gonna Need It):**
- No additional features added
- Only fixing existing bugs
- Optional task (3) improves clarity without adding functionality

**TDD (Test Driven Development):**
- Type checking serves as compile-time tests
- Manual testing validates bookmark creation and suggest operations
- Future: Add integration tests for MCP tools

---

## Risk Assessment

**Low Risk:**
- Field name fix (corrects critical bug, no breaking changes)
- Suggest handler (adds missing functionality, existing schema already allows it)

**No Risk:**
- Vercel rewrite change (optional, doesn't affect functionality)

**Mitigation:**
- Test bookmark creation after fix
- Test suggest operation returns valid data
- Verify OAuth still works after vercel.json change

---

## Testing Guide

After implementation, manually test:

**Test 1: Bookmark Creation**
```json
{
  "operation": "create",
  "url": "https://example.com",
  "title": "Test Bookmark",
  "collectionId": -1
}
```
Expected: Bookmark created successfully (not "link required" error)

**Test 2: Suggest Operation**
```json
{
  "operation": "suggest",
  "url": "https://github.com/facebook/react"
}
```
Expected: Returns suggested collections and tags (not "Unknown operation" error)

**Test 3: OAuth Flow** (if vercel.json changed)
```
1. Visit: https://your-app.vercel.app/api/auth/init?redirect_uri=/
2. Authorize on Raindrop
3. Verify redirect back works
```
Expected: OAuth flow completes successfully
