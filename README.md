# Raindrop.io MCP Server

A Model Context Protocol (MCP) server for interacting with [Raindrop.io](https://raindrop.io/) bookmarking service.

## Overview

This project provides an MCP server that allows AI assistants and other MCP clients to access and manage Raindrop.io bookmarks, collections, tags, and highlights.

## Prerequisites

- Node.js v18 or later (or Bun)
- A Raindrop.io account
- A Raindrop.io API Access Token

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Aarekaz/raindrop-mcp.git
cd raindrop-mcp
```

### 2. Install dependencies

```bash
bun install
# or
npm install
```

### 3. Configure environment variables

Copy the example environment file and add your Raindrop.io API token:

```bash
cp .env.example .env
```

Edit `.env` and add your token:

```env
RAINDROP_ACCESS_TOKEN=your_actual_token_here
```

You can create an API token at: https://app.raindrop.io/settings/integrations

### 4. Build the project

```bash
bun run build
```

### 5. Run the server

```bash
bun start
```

## Development

```bash
# Run in development mode with hot reload
bun run dev

# Run type checking
bun run type-check

# Run tests
bun test

# Clean build directory
bun run clean
```

## Project Structure

```
raindrop-mcp/
├── src/              # Source code
├── tests/            # Test files
├── build/            # Compiled output
├── package.json      # Package configuration
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

## License

MIT

## Author

Anurag Dhungana
