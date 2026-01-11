# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the TypeScript source. Entry points are `src/index.ts` (STDIO) and `src/http-server.ts` (HTTP).
- `src/adapters/` holds deployment adapters (Vercel, Cloudflare Workers).
- `src/services/` implements the Raindrop API client and MCP service layer.
- `tests/` contains Bun tests (e.g., `tests/raindrop.service.test.ts`).
- `docs/` includes deployment and transport guides.
- `build/` is generated output from Bun builds.

## Build, Test, and Development Commands
- `npm run dev` - Build and run STDIO server with Bun watch.
- `npm run dev:http` - Build and run HTTP server with Bun watch.
- `npm run build` - Bundle STDIO entry to `build/`.
- `npm run build:http` - Bundle HTTP entry to `build/`.
- `npm run build:cloudflare` - Bundle the Cloudflare Worker entry.
- `npm run test` - Run Bun tests in `tests/`.
- `npm run type-check` - Run `tsc --noEmit` type checks.
- `npm run clean` - Remove `build/` artifacts.

## Coding Style & Naming Conventions
- TypeScript with strict compiler options (`tsconfig.json`); avoid `any`.
- 2-space indentation and semicolons, matching existing files in `src/`.
- Use descriptive `camelCase` for functions/variables and `PascalCase` for classes.
- No lint/format tooling is configured; keep diffs tidy and consistent with nearby code.

## Testing Guidelines
- Tests live in `tests/` and follow `*.test.ts` naming.
- Tests require `RAINDROP_ACCESS_TOKEN` in `.env` (see `.env.example`).
- Run a specific file with `bun test tests/raindropmcp.service.test.ts`.

## Commit & Pull Request Guidelines
- Recent commits use imperative sentence-style messages (e.g., "Add ...", "Update ...").
- Keep commits scoped and explain intent in the subject line.
- PRs should include a concise description, test results (or reason for omission), and any relevant deployment notes (Vercel/Cloudflare).

## Security & Configuration Tips
- Store secrets in `.env` locally; never commit tokens.
- For HTTP deployments, set `API_KEY` and restrict `CORS_ORIGIN`.
- Prefer per-user tokens via `X-Raindrop-Token` for multi-tenant setups.
