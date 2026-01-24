# Security Audit Report
**Date:** 2026-01-24
**Repository:** raindrop-mcp (PUBLIC)
**Branch Analyzed:** http-transport-serverless

---

## Executive Summary

**CRITICAL SECURITY ISSUE IDENTIFIED**

An API token for Raindrop.io was committed to the public repository and remains in git history despite being removed from the current working tree.

### Severity: HIGH
- Repository is public
- Token is accessible to anyone who clones the repository
- Token grants full API access to the Raindrop.io account

---

## Findings

### 1. Exposed API Token

**Token:** `5c03cd48-cd89-4d0b-a448-cc6e0550b003`
**Service:** Raindrop.io API
**File:** `claude-desktop-config.json`

**Timeline:**
- **Added:** Commit `cf3ddfe96f0c74e5454b2a6385ff24f3c93f28e2` (2026-01-10)
  - Message: "Add AI-powered suggestions and filter statistics to Raindrop services"
- **Removed:** Commit `1b033bd7849a88231e589a5a1461fb2d0fee1669` (2026-01-24)
  - Message: "security: remove hardcoded API token from config"

**Exposure Duration:** 14 days in public repository

**Impact:**
- Anyone who cloned the repository has access to the token in their local history
- The token is visible on GitHub's commit history
- Token can be used to access/modify Raindrop.io bookmarks and collections
- Token remains valid until manually revoked

### 2. Co-Authored-By Tags in Commits

**Issue:** Recent commits contain AI attribution tags that may not align with commit authorship policies.

**Affected Commits (Last 5):**
1. `46ce95c` - docs: add configuration and security documentation
2. `0688856` - fix: correct API method call signatures for Raindrop service
3. `18ffbf7` - fix: retrieve OAuth redirectUri before state deletion in Express routes
4. `15c0bb9` - fix: retrieve OAuth redirectUri before state deletion
5. `1b033bd` - security: remove hardcoded API token from config

**Tag:** `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`

**Impact:** Minor - may affect attribution/contributor analytics

---

## Evidence

### Commit Showing Token Addition
```
commit cf3ddfe96f0c74e5454b2a6385ff24f3c93f28e2
Author: Anurag Dhungana <36888347+Aarekaz@users.noreply.github.com>
Date:   Sat Jan 10 00:12:00 2026 -0500

    Add AI-powered suggestions and filter statistics to Raindrop services

+++ b/claude-desktop-config.json
+        "RAINDROP_ACCESS_TOKEN": "5c03cd48-cd89-4d0b-a448-cc6e0550b003"
```

### Commit Showing Token Removal
```
commit 1b033bd7849a88231e589a5a1461fb2d0fee1669
Author: Anurag Dhungana <36888347+Aarekaz@users.noreply.github.com>
Date:   Sat Jan 24 12:48:02 2026 -0500

    security: remove hardcoded API token from config

--- a/claude-desktop-config.json
-        "RAINDROP_ACCESS_TOKEN": "5c03cd48-cd89-4d0b-a448-cc6e0550b003"
```

**Note:** The file was removed from the working tree but remains in git history.

---

## Current Status

### Positive Actions Already Taken
✓ File added to `.gitignore`
✓ Example config file created (`claude-desktop-config.example.json`)
✓ File removed from current working tree

### Still Required
✗ Token not yet revoked
✗ Token still in git history
✗ No git history rewrite performed
✗ Public repository still exposes the token

---

## Recommendations

### Immediate Actions (Priority: CRITICAL)

1. **Revoke the exposed token**
   - Access: https://app.raindrop.io/settings/integrations
   - Revoke: `5c03cd48-cd89-4d0b-a448-cc6e0550b003`
   - Generate new token
   - Update local configuration only (never commit)

2. **Rewrite git history to remove token**
   - Use `git-filter-repo` to remove `claude-desktop-config.json` from all history
   - Force push to update public repository
   - Verify token is completely removed

3. **Remove Co-Authored-By tags**
   - Use interactive rebase on last 5 commits
   - Clean commit messages

### Follow-Up Actions (Priority: HIGH)

4. **Implement secret scanning**
   - Add pre-commit hooks for secret detection
   - Consider GitHub Advanced Security features
   - Use tools like `git-secrets` or `detect-secrets`

5. **Review security practices**
   - Audit other repositories for similar issues
   - Implement environment variable usage
   - Document security policies

6. **Notify stakeholders**
   - Inform collaborators of history rewrite
   - Provide re-clone instructions
   - Document incident for future reference

---

## Detailed Remediation Plan

See: `SECURITY_CLEANUP_INSTRUCTIONS.md`

A step-by-step guide has been prepared with:
- Token revocation instructions
- Git history rewrite commands
- Verification steps
- Post-cleanup actions

**Helper Script:** `cleanup-script.sh` (executable)

---

## Prevention Measures

### For This Repository

1. **Already Implemented:**
   - `.gitignore` includes `claude-desktop-config.json`
   - Example config file documents required structure
   - Security documentation added to README

2. **Recommended:**
   ```bash
   # Add to package.json scripts
   "precommit": "git-secrets --scan"

   # Install git-secrets
   brew install git-secrets
   git secrets --install
   git secrets --register-aws
   git secrets --add '5c03cd48-cd89-4d0b-a448-cc6e0550b003'  # Block this token
   ```

3. **Future Commits:**
   - Always use environment variables for secrets
   - Never commit `.env` files
   - Review diffs before committing
   - Use `git diff --cached` before pushing

### Organization-Wide

1. Enable GitHub secret scanning alerts
2. Implement required status checks
3. Use GitHub Actions for automated security scans
4. Require code reviews for all changes
5. Establish security training for contributors

---

## Additional Files Found

During the audit, the following sensitive-looking files were identified:

```bash
# Already properly ignored
.env*
*.key
*.pem
```

**Status:** No additional exposure found. Proper `.gitignore` patterns in place.

---

## Testing & Verification

### How to Verify Token is Removed from History

```bash
# Should return no results after cleanup
git log --all --full-history -S "5c03cd48"

# Should show no commits after cleanup
git log --all --full-history -- claude-desktop-config.json
```

### How to Verify Token is Revoked

```bash
# Should fail with 401 Unauthorized after revocation
curl -H "Authorization: Bearer 5c03cd48-cd89-4d0b-a448-cc6e0550b003" \
     https://api.raindrop.io/rest/v1/user
```

---

## Conclusion

This security issue requires immediate attention but is fully remediable. The provided instructions and scripts will completely remove the token from git history and prevent future exposure.

**Timeline for Resolution:**
- Token revocation: 5 minutes
- Git history cleanup: 15 minutes
- Verification: 5 minutes
- **Total estimated time: 25 minutes**

**Post-remediation state:**
- Token completely removed from public history
- New token secured in local configuration only
- No future commits will contain secrets
- Repository safe for public access

---

## Incident Classification

**Type:** Accidental credential exposure
**Vector:** Committed configuration file
**Detection:** Manual audit
**Exploited:** Unknown (assume yes, given public repository)
**Contained:** Partial (removed from working tree, not from history)

**Incident ID:** SEC-2026-01-24-001
**Reporter:** Security Audit
**Status:** Identified, remediation in progress

---

## Appendix: Technical Details

### Repository Information
- **URL:** https://github.com/Aarekaz/raindrop-mcp
- **Visibility:** PUBLIC
- **Current Branch:** http-transport-serverless
- **Main Branch:** main

### Affected Commits
- First exposure: `cf3ddfe96f0c74e5454b2a6385ff24f3c93f28e2`
- Removal attempt: `1b033bd7849a88231e589a5a1461fb2d0fee1669`
- Commits with Co-Authored-By: Last 5 commits (see Finding #2)

### File Path
- Original: `/claude-desktop-config.json`
- Example: `/claude-desktop-config.example.json`
- Ignored: Via `.gitignore`

### API Details
- **Service:** Raindrop.io
- **API Base:** https://api.raindrop.io/rest/v1/
- **Authentication:** Bearer token
- **Permissions:** Full account access
- **Token Format:** UUID v4

---

**Report Generated:** 2026-01-24
**Next Review:** After remediation completion
**Document Classification:** Internal Security Report
