# Raindrop.io MCP Server

A Model Context Protocol (MCP) server for interacting with [Raindrop.io](https://raindrop.io/) bookmarking service. This allows AI assistants like Claude to manage your bookmarks, collections, tags, and highlights.

## Features

- 📚 **Collection Management** - Create, update, delete, and list collections
- 🔖 **Bookmark Operations** - Full CRUD operations for bookmarks with advanced search
- 🏷️ **Tag Management** - List and organize tags across collections
- ✨ **Highlight Support** - Create and manage text highlights with color coding
- ⚡ **Bulk Operations** - Update multiple bookmarks efficiently
- 🔗 **Resource Links** - Efficient data access using MCP resource link pattern
- 🛡️ **Type Safe** - Full TypeScript implementation with Zod validation

## Prerequisites

- Node.js v18+ or Bun runtime
- A Raindrop.io account
- A Raindrop.io API Access Token ([Get one here](https://app.raindrop.io/settings/integrations))

## Quick Start

### Installation

```bash
git clone https://github.com/Aarekaz/raindrop-mcp.git
cd raindrop-mcp
bun install
# or npm install
```

### Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your Raindrop.io API token:
```env
RAINDROP_ACCESS_TOKEN=your_token_here
```

### Build and Run

```bash
# Build the project
bun run build

# Run the server
bun start
```

## Claude Desktop Integration

To use this MCP server with Claude Desktop, add the following to your Claude configuration file:

### macOS/Linux
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "raindrop": {
      "command": "node",
      "args": ["/absolute/path/to/raindrop-mcp/build/index.js"],
      "env": {
        "RAINDROP_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

### Windows
Edit `%APPDATA%\Claude\claude_desktop_config.json` with the same configuration.

### Alternative: Using npx

If you publish this to npm, users can also use:

```json
{
  "mcpServers": {
    "raindrop": {
      "command": "npx",
      "args": ["@aarekaz/raindrop-mcp"],
      "env": {
        "RAINDROP_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Available MCP Tools

### 1. collection_list
List all your Raindrop.io collections.

**Example:**
```
List all my Raindrop collections
```

### 2. collection_manage
Create, update, or delete collections.

**Examples:**
```
Create a new collection called "AI Research"
Update collection 12345 to have description "Machine learning papers"
Delete collection 12345
```

### 3. bookmark_search
Search bookmarks with advanced filters.

**Examples:**
```
Search for bookmarks about "typescript" in collection 12345
Find all important bookmarks tagged with "tutorial"
Show me bookmarks from last week sorted by creation date
```

**Parameters:**
- `search` - Full-text search query
- `collection` - Filter by collection ID
- `tags` - Filter by tags
- `important` - Filter favorites only
- `page` - Page number
- `perPage` - Results per page (max 50)
- `sort` - Sort order (score, title, -created, created)

### 4. bookmark_manage
Create, update, or delete bookmarks.

**Examples:**
```
Add bookmark https://example.com to collection 12345 with title "Example Site"
Update bookmark 67890 to add tags "reference" and "docs"
Delete bookmark 67890
```

### 5. tag_list
List all tags with usage counts.

**Examples:**
```
Show all my tags
List tags for collection 12345
```

### 6. highlight_manage
Manage text highlights on bookmarks.

**Examples:**
```
List highlights for bookmark 12345
Create a yellow highlight on bookmark 12345 with text "Important concept"
Update highlight abc123 to change color to blue
Delete highlight abc123
```

**Supported colors:** yellow, blue, green, red, purple

### 7. bulk_edit_bookmarks
Update multiple bookmarks at once.

**Examples:**
```
Mark bookmarks 111, 222, 333 as important and add tag "urgent"
Move all bookmarks from collection 12345 to collection 67890
Remove all tags from bookmarks in collection 12345
```

**Parameters:**
- `collectionId` - Collection to operate on
- `ids` - Specific bookmark IDs (optional, affects all if omitted)
- `important` - Set favorite status
- `tags` - Set tags (empty array removes all)
- `media` - Set media URLs
- `cover` - Set cover image
- `moveToCollection` - Move to another collection

## Resource Access

The server provides dynamic resources for detailed data access:

- `mcp://user/profile` - Your Raindrop.io account information
- `mcp://collection/{id}` - Detailed collection data
- `mcp://raindrop/{id}` - Detailed bookmark data

## Development

### Available Scripts

```bash
# Development mode with hot reload
bun run dev

# Type checking
bun run type-check

# Run tests
bun test

# Run tests with coverage
bun test --coverage

# Build for production
bun run build

# Clean build directory
bun run clean
```

### Running Tests

Tests require a valid `RAINDROP_ACCESS_TOKEN` in your `.env` file:

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/raindrop.service.test.ts

# Watch mode
bun test --watch
```

### Project Structure

```
raindrop-mcp/
├── src/
│   ├── index.ts              # Server entry point
│   ├── services/
│   │   ├── raindrop.service.ts      # Raindrop.io API client
│   │   └── raindropmcp.service.ts   # MCP server implementation
│   ├── types/
│   │   ├── raindrop.schema.d.ts     # API type definitions
│   │   └── raindrop-zod.schemas.ts  # Zod validation schemas
│   └── utils/
│       └── logger.ts         # Logging utility
├── tests/                    # Test files
├── build/                    # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

## Deployment

This section covers various deployment options for the Raindrop MCP server.

### Deployment Overview

The Raindrop MCP server is designed to run as a STDIO-based process, using standard input/output for communication with MCP clients like Claude Desktop. This architecture supports several deployment strategies:

- **NPM Package Distribution** - Publish to npm registry for easy installation
- **Docker Containers** - Containerized deployment for consistent environments
- **CI/CD Automation** - Automated testing and release pipelines
- **System Services** - Long-running background processes on Linux servers
- **Binary Compilation** - Standalone executables for simplified distribution

### Publishing to NPM

Publishing to npm allows users to install and run the server using `npx` without cloning the repository.

#### Prerequisites

- An npm account (sign up at https://www.npmjs.com)
- npm CLI installed and authenticated (`npm login`)

#### Pre-publish Checklist

1. Update version in `package.json`:
```bash
npm version patch  # or minor, major
```

2. Ensure all tests pass:
```bash
bun test
```

3. Build the project:
```bash
bun run build
```

4. Verify package contents:
```bash
npm pack --dry-run
```

This will show which files will be included (specified in the `files` field of package.json).

#### Publishing Steps

1. Login to npm (if not already logged in):
```bash
npm login
```

2. Publish the package:
```bash
npm publish --access public
```

For scoped packages like `@aarekaz/raindrop-mcp`, the `--access public` flag is required for the first publish.

#### Updating the Package

For subsequent releases:

```bash
# Make your changes
git add .
git commit -m "feat: add new feature"

# Update version
npm version patch  # or minor, major

# Build and test
bun run build
bun test

# Publish
npm publish

# Push tags to GitHub
git push && git push --tags
```

#### Version Guidelines

Follow semantic versioning (semver):
- **Patch** (0.1.x): Bug fixes and minor changes
- **Minor** (0.x.0): New features, backwards compatible
- **Major** (x.0.0): Breaking changes

#### After Publishing

Users can now install and use the server via npx:

```bash
npx @aarekaz/raindrop-mcp
```

Or add it to Claude Desktop config:

```json
{
  "mcpServers": {
    "raindrop": {
      "command": "npx",
      "args": ["@aarekaz/raindrop-mcp"],
      "env": {
        "RAINDROP_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

### Docker Deployment

Docker provides a consistent, portable environment for running the MCP server across different platforms.

#### Building the Docker Image

1. Build the image:
```bash
docker build -t raindrop-mcp:latest .
```

2. Tag for a registry (optional):
```bash
docker tag raindrop-mcp:latest username/raindrop-mcp:latest
```

#### Running with Docker

Run the container with your API token:

```bash
docker run -it --rm \
  -e RAINDROP_ACCESS_TOKEN=your_token_here \
  raindrop-mcp:latest
```

#### Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  raindrop-mcp:
    build: .
    environment:
      - RAINDROP_ACCESS_TOKEN=${RAINDROP_ACCESS_TOKEN}
      - NODE_ENV=production
    stdin_open: true
    tty: true
    restart: unless-stopped
```

Run with:

```bash
RAINDROP_ACCESS_TOKEN=your_token docker-compose up
```

#### Publishing to Docker Hub

1. Login to Docker Hub:
```bash
docker login
```

2. Push the image:
```bash
docker push username/raindrop-mcp:latest
```

#### Multi-architecture Builds

Build for multiple platforms:

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t username/raindrop-mcp:latest \
  --push .
```

#### Using with Claude Desktop

You can configure Claude Desktop to use the Docker container:

```json
{
  "mcpServers": {
    "raindrop": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "RAINDROP_ACCESS_TOKEN=your_token_here",
        "raindrop-mcp:latest"
      ]
    }
  }
}
```

### CI/CD with GitHub Actions

Automate testing and publishing using GitHub Actions workflows.

#### Continuous Integration

The CI workflow (`.github/workflows/ci.yml`) runs on every push and pull request:

- Runs tests across multiple Node.js versions
- Performs type checking
- Builds the project
- Validates code quality

#### Automated Publishing

The publish workflow (`.github/workflows/publish.yml`) automatically publishes to npm when you create a GitHub release:

1. Create a new release on GitHub
2. The workflow automatically builds and publishes to npm
3. Users can immediately install the new version

#### Required Secrets

Add these secrets to your GitHub repository (Settings > Secrets and variables > Actions):

- `NPM_TOKEN`: Your npm access token (create at https://www.npmjs.com/settings/tokens)
- `RAINDROP_ACCESS_TOKEN`: Your Raindrop.io API token (for running tests)

#### Creating a Release

```bash
# Update version
npm version minor

# Push with tags
git push && git push --tags

# Create release on GitHub
# Go to https://github.com/Aarekaz/raindrop-mcp/releases/new
# Or use GitHub CLI:
gh release create v0.2.0 --title "Version 0.2.0" --notes "Release notes here"
```

### Systemd Service (Linux)

Run the MCP server as a system service on Linux servers for persistent operation.

#### Service Configuration

Create `/etc/systemd/system/raindrop-mcp.service`:

```ini
[Unit]
Description=Raindrop MCP Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/raindrop-mcp
Environment="RAINDROP_ACCESS_TOKEN=your_token_here"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/bun run /opt/raindrop-mcp/build/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=raindrop-mcp

[Install]
WantedBy=multi-user.target
```

#### Installation Steps

1. Clone and build the project:
```bash
sudo mkdir -p /opt/raindrop-mcp
sudo chown $USER:$USER /opt/raindrop-mcp
cd /opt/raindrop-mcp
git clone https://github.com/Aarekaz/raindrop-mcp.git .
bun install
bun run build
```

2. Create the service file:
```bash
sudo nano /etc/systemd/system/raindrop-mcp.service
# Paste the service configuration above
```

3. Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable raindrop-mcp
sudo systemctl start raindrop-mcp
```

#### Service Management

```bash
# Check status
sudo systemctl status raindrop-mcp

# View logs
sudo journalctl -u raindrop-mcp -f

# Restart service
sudo systemctl restart raindrop-mcp

# Stop service
sudo systemctl stop raindrop-mcp

# Disable service
sudo systemctl disable raindrop-mcp
```

#### Updating the Service

```bash
# Stop the service
sudo systemctl stop raindrop-mcp

# Update code
cd /opt/raindrop-mcp
git pull
bun install
bun run build

# Restart service
sudo systemctl start raindrop-mcp
```

### Binary Compilation with Bun

Compile the server into a standalone executable for easy distribution.

#### Building a Binary

```bash
# Compile for current platform
bun build --compile --minify --sourcemap ./src/index.ts --outfile raindrop-mcp

# The result is a single executable file
./raindrop-mcp
```

#### Cross-platform Builds

Bun supports building for different platforms:

```bash
# Build for Linux
bun build --compile --target=bun-linux-x64 ./src/index.ts --outfile raindrop-mcp-linux

# Build for macOS
bun build --compile --target=bun-darwin-x64 ./src/index.ts --outfile raindrop-mcp-macos

# Build for Windows
bun build --compile --target=bun-windows-x64 ./src/index.ts --outfile raindrop-mcp.exe
```

#### Using the Binary

Users can run the compiled binary directly:

```bash
# Set environment variable
export RAINDROP_ACCESS_TOKEN=your_token_here

# Run the binary
./raindrop-mcp
```

Or configure with Claude Desktop:

```json
{
  "mcpServers": {
    "raindrop": {
      "command": "/path/to/raindrop-mcp",
      "env": {
        "RAINDROP_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

#### Distribution

Attach compiled binaries to GitHub releases:

```bash
# Create release with binaries
gh release create v0.2.0 \
  --title "Version 0.2.0" \
  --notes "Release notes" \
  raindrop-mcp-linux \
  raindrop-mcp-macos \
  raindrop-mcp.exe
```

## Usage Examples

Here are some practical examples of what you can do with Claude:

### Organize Your Reading List
```
Search my Raindrop bookmarks for articles about "machine learning" 
and create a new collection called "ML Resources" then move those 
bookmarks there.
```

### Bulk Tag Management
```
Find all bookmarks in my "Articles" collection that are marked as 
important and add the tag "priority" to all of them.
```

### Research Workflow
```
Create a collection called "TypeScript Study", then search for all 
bookmarks tagged "typescript" and move them to this new collection.
```

### Highlight Management
```
Show me all highlights from bookmark 12345, then create a summary 
of the key points.
```

## Troubleshooting

### "RAINDROP_ACCESS_TOKEN is required" Error

1. Make sure you've created a `.env` file in the project root
2. Get your API token from https://app.raindrop.io/settings/integrations
3. Add it to `.env` as: `RAINDROP_ACCESS_TOKEN=your_token_here`

### Claude Can't Find the Server

1. Ensure the path in `claude_desktop_config.json` is absolute
2. Verify the build directory exists: `bun run build`
3. Check Claude's logs: `~/Library/Logs/Claude/` (macOS)

### Tests Failing

1. Ensure `RAINDROP_ACCESS_TOKEN` is set in `.env`
2. Check your internet connection
3. Verify your token is valid at https://app.raindrop.io

## Architecture

### Service Layers

1. **RaindropService** - Low-level API client
   - Type-safe API calls using openapi-fetch
   - Error handling and request/response interceptors
   - Direct mapping to Raindrop.io REST API

2. **RaindropMCPService** - MCP protocol layer
   - Exposes Raindrop functionality as MCP tools
   - Implements resource link pattern for efficiency
   - Handles MCP-specific concerns (resources, validation)

### Tool Design

Tools follow a consistent pattern:
- Input validation using Zod schemas
- Operation parameter for CRUD actions
- Resource links for efficient data transfer
- Comprehensive error handling

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Author

Anurag Dhungana

## Acknowledgments

- Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Raindrop.io API documentation: https://developer.raindrop.io
- Inspired by the MCP community

## Links

- [GitHub Repository](https://github.com/Aarekaz/raindrop-mcp)
- [Raindrop.io](https://raindrop.io)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Report Issues](https://github.com/Aarekaz/raindrop-mcp/issues)
