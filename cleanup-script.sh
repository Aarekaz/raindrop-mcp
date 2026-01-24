#!/bin/bash
# Security Cleanup Script for raindrop-mcp
# DO NOT RUN THIS ENTIRE SCRIPT AT ONCE
# Use it as a reference and execute steps manually

set -e

echo "========================================="
echo "Security Cleanup Script"
echo "========================================="
echo ""
echo "WARNING: This script contains destructive operations."
echo "Read SECURITY_CLEANUP_INSTRUCTIONS.md first."
echo ""
echo "Press Ctrl+C to abort, or any key to continue..."
read -n 1

# Verify we're in the right directory
if [ ! -d ".git" ]; then
    echo "Error: Not in a git repository"
    exit 1
fi

echo ""
echo "Step 1: Have you revoked the old token? (y/n)"
read -r response
if [ "$response" != "y" ]; then
    echo "Please revoke the token first at https://app.raindrop.io/settings/integrations"
    exit 1
fi

echo ""
echo "========================================="
echo "Step 2: Removing Co-Authored-By tags"
echo "========================================="
echo ""
echo "About to start interactive rebase."
echo "Change 'pick' to 'reword' for all 5 commits."
echo "Then remove 'Co-Authored-By' lines from each commit message."
echo ""
echo "Press any key to continue..."
read -n 1

git rebase -i HEAD~5

echo ""
echo "========================================="
echo "Step 3: Installing git-filter-repo"
echo "========================================="
echo ""

# Try to install git-filter-repo
if command -v brew &> /dev/null; then
    echo "Homebrew detected. Installing git-filter-repo..."
    brew install git-filter-repo
elif command -v pip3 &> /dev/null; then
    echo "pip3 detected. Installing git-filter-repo..."
    pip3 install git-filter-repo
elif command -v pip &> /dev/null; then
    echo "pip detected. Installing git-filter-repo..."
    pip install git-filter-repo
else
    echo "Error: Cannot find package manager. Please install git-filter-repo manually."
    exit 1
fi

echo ""
echo "========================================="
echo "Step 4: Removing token from git history"
echo "========================================="
echo ""
echo "WARNING: This will rewrite git history."
echo "All commit hashes will change."
echo ""
echo "Press any key to continue..."
read -n 1

git filter-repo --path claude-desktop-config.json --invert-paths --force

echo ""
echo "========================================="
echo "Step 5: Verification"
echo "========================================="
echo ""

echo "Searching for token in history (should be empty):"
git log --all --full-history --source -S "5c03cd48" --pretty=format:"%H %s" || echo "✓ Token not found in history"

echo ""
echo ""
echo "Searching for claude-desktop-config.json in history (should be empty):"
git log --all --full-history --source -- claude-desktop-config.json || echo "✓ File not found in history"

echo ""
echo ""
echo "Searching for Co-Authored-By tags in recent commits (should be empty):"
git log HEAD~5..HEAD --format="%H%n%s%n%b%n---" | grep -i "co-authored" || echo "✓ No Co-Authored-By tags found"

echo ""
echo ""
echo "========================================="
echo "Step 6: Force Push"
echo "========================================="
echo ""
echo "Ready to force push to origin/http-transport-serverless"
echo "This will overwrite remote history."
echo ""
echo "Continue? (y/n)"
read -r response
if [ "$response" != "y" ]; then
    echo "Aborted. You can force push later with:"
    echo "  git push origin http-transport-serverless --force"
    exit 0
fi

git push origin http-transport-serverless --force

echo ""
echo "========================================="
echo "Cleanup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Verify on GitHub that history is clean"
echo "2. Update local claude-desktop-config.json with new token"
echo "3. Inform collaborators to re-clone the repository"
echo ""
echo "See SECURITY_CLEANUP_INSTRUCTIONS.md for details."
