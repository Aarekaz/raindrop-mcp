# Raindrop MCP TODO

## Completed
- [x] Extract shared static CSS into `public/styles/base.css`, `landing.css`, and `docs.css`
- [x] Add `/info`-driven hydration via `public/scripts/site.js`
- [x] Move landing and docs page scripts to external files

## Next up
- [ ] Split `src/mcp/raindrop-handler.ts` into tool modules
- [ ] Enforce `raindrop:write` scope on destructive MCP tools
- [ ] Add Cloudflare rate limiting on OAuth and `/mcp`
- [ ] Finish evaluation runner (`npm run eval`) and test data seed script
- [ ] Remove unused `axios` dependency
- [ ] Sync version numbers across `package.json`, `/info`, and MCP server metadata
