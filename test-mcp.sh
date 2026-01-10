#!/bin/bash
# Simple test script for MCP server via STDIO

# Test 1: List tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node build/index.js

echo ""
echo "==================================="
echo ""

# Test 2: Call suggestion API
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"bookmark_manage","arguments":{"operation":"suggest","url":"https://github.com/microsoft/TypeScript"}}}' | node build/index.js
