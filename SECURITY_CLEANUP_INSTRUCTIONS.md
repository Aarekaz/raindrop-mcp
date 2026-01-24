# URGENT: Security Cleanup Instructions

## Overview
The repository has an exposed Raindrop API token (`5c03cd48-cd89-4d0b-a448-cc6e0550b003`) in git history. This guide will help you:
1. Revoke the exposed token
2. Remove Co-Authored-By tags from recent commits
3. Remove the token from git history
4. Update the remote repository

**CRITICAL**: This repo is PUBLIC. Complete all steps immediately.

---

## Step 1: Revoke the Exposed Token (DO THIS FIRST!)

Before touching git history, revoke the token so it becomes useless:

1. Go to [Raindrop.io Settings](https://app.raindrop.io/settings/integrations)
2. Navigate to "For Developers" → "Create new app" or manage existing apps
3. Revoke/delete the token: `5c03cd48-cd89-4d0b-a448-cc6e0550b003`
4. Generate a new token and save it securely (do NOT commit it)
5. Update your local `claude-desktop-config.json` with the new token

**✓ Confirm token is revoked before proceeding to Step 2**

---

## Step 2: Remove Co-Authored-By Tags from Recent Commits

The last 5 commits contain Co-Authored-By tags that need removal:

```bash
# Navigate to your repository
cd /Users/aarekaz/Development/raindrop-mcp

# Start interactive rebase for the last 5 commits
git rebase -i HEAD~5
```

### What to do in the editor:

1. An editor will open showing these commits:
   ```
   pick 1b033bd security: remove hardcoded API token from config
   pick 15c0bb9 fix: retrieve OAuth redirectUri before state deletion
   pick 18ffbf7 fix: retrieve OAuth redirectUri before state deletion in Express routes
   pick 0688856 fix: correct API method call signatures for Raindrop service
   pick 46ce95c docs: add configuration and security documentation
   ```

2. Change `pick` to `reword` (or just `r`) for ALL 5 commits:
   ```
   reword 1b033bd security: remove hardcoded API token from config
   reword 15c0bb9 fix: retrieve OAuth redirectUri before state deletion
   reword 18ffbf7 fix: retrieve OAuth redirectUri before state deletion in Express routes
   reword 0688856 fix: correct API method call signatures for Raindrop service
   reword 46ce95c docs: add configuration and security documentation
   ```

3. Save and close the editor

4. For EACH commit, a new editor will open with the commit message. Remove this line:
   ```
   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   ```

   Then save and close. Repeat for all 5 commits.

### Example for commit 1b033bd:

**Before:**
```
security: remove hardcoded API token from config

- Add claude-desktop-config.json to .gitignore
- Create example config file for documentation
- Remove real config from git tracking

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**After:**
```
security: remove hardcoded API token from config

- Add claude-desktop-config.json to .gitignore
- Create example config file for documentation
- Remove real config from git tracking
```

Repeat this for all 5 commits.

---

## Step 3: Remove Token from Git History

Now we'll completely remove `claude-desktop-config.json` from all git history.

### Install git-filter-repo

```bash
# If you have Homebrew (recommended for macOS)
brew install git-filter-repo

# OR using pip
pip install git-filter-repo

# OR using pip3
pip3 install git-filter-repo
```

### Run the cleanup

```bash
# Make sure you're in the repository
cd /Users/aarekaz/Development/raindrop-mcp

# Remove the file from entire git history
git filter-repo --path claude-desktop-config.json --invert-paths --force
```

**What this does:**
- Removes `claude-desktop-config.json` from every commit where it existed
- Rewrites all commit SHAs (history will change)
- The token will be completely gone from git history

**Warning:** This rewrites history and changes commit hashes. Anyone who has cloned the repo will need to re-clone.

---

## Step 4: Verify the Cleanup

```bash
# Search for the token in all history (should return nothing)
git log --all --full-history --source -S "5c03cd48" --pretty=format:"%H %s"

# Verify the file is gone from history
git log --all --full-history --source -- claude-desktop-config.json

# Check that Co-Authored-By tags are removed
git log HEAD~5..HEAD --format="%H%n%s%n%b%n---" | grep -i "co-authored"
```

All commands should return empty results or "no matches".

---

## Step 5: Force Push to Remote

**WARNING:** Force pushing rewrites public history. This is necessary but disruptive.

```bash
# Force push the cleaned branch
git push origin http-transport-serverless --force

# If you have other branches that reference the old commits, clean those too
git push origin main --force  # Only if main also has the issue
```

---

## Step 6: Verify on GitHub

1. Go to your repository on GitHub
2. Navigate to the commit history
3. Search for the old commit SHAs (they should be gone)
4. Check that `claude-desktop-config.json` doesn't appear in history
5. Verify Co-Authored-By tags are removed

---

## Step 7: Post-Cleanup Actions

### Update your local config
Ensure your local `claude-desktop-config.json` uses the NEW token:

```json
{
  "mcpServers": {
    "raindrop-mcp": {
      "command": "node",
      "args": ["/Users/aarekaz/Development/raindrop-mcp/dist/index.js"],
      "env": {
        "RAINDROP_ACCESS_TOKEN": "YOUR_NEW_TOKEN_HERE"
      }
    }
  }
}
```

### Inform collaborators
If anyone else has cloned this repository:

```bash
# They need to re-clone the repository
git clone https://github.com/Aarekaz/raindrop-mcp.git

# OR force update their existing clone (dangerous, will lose local changes)
git fetch origin
git reset --hard origin/http-transport-serverless
```

### Security best practices going forward
1. Never commit API tokens, keys, or secrets
2. Always use `.gitignore` for config files with secrets
3. Use environment variables or `.env` files (also in `.gitignore`)
4. Use `.example` files to document required configuration
5. Consider using secret scanning tools in CI/CD

---

## Troubleshooting

### "git-filter-repo not found"
Try all installation methods above. On macOS, Homebrew is most reliable.

### "Cannot rebase: You have unstaged changes"
```bash
git stash
# Then retry the rebase
git stash pop  # After rebase completes
```

### "Rebase conflicts"
This shouldn't happen when just rewording messages, but if it does:
```bash
git rebase --abort
# Contact support for help
```

### "Remote rejected: push"
Make sure you're using `--force`:
```bash
git push origin http-transport-serverless --force
```

---

## Summary Checklist

- [ ] Revoke old token in Raindrop.io settings
- [ ] Generate new token and update local config
- [ ] Run `git rebase -i HEAD~5` and reword all 5 commits
- [ ] Remove Co-Authored-By lines from each commit message
- [ ] Install git-filter-repo
- [ ] Run `git filter-repo --path claude-desktop-config.json --invert-paths --force`
- [ ] Verify token is gone from history
- [ ] Force push to remote: `git push origin http-transport-serverless --force`
- [ ] Verify on GitHub that history is clean
- [ ] Update local claude-desktop-config.json with new token
- [ ] Inform any collaborators to re-clone

---

## Questions or Issues?

If you encounter any problems during cleanup, stop and seek help before force pushing.

**This is a one-way operation - verify each step before proceeding.**
