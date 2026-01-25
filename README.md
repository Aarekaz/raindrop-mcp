# Raindrop.io MCP Server

A Model Context Protocol (MCP) server for interacting with [Raindrop.io](https://raindrop.io/) bookmarking service. This allows AI assistants like Claude to manage your bookmarks, collections, tags, and highlights.

**Now with HTTP transport and serverless deployment support!** 🚀

## Features

- 📚 **Collection Management** - Create, update, delete, and list collections
- 🔖 **Bookmark Operations** - Full CRUD operations for bookmarks with advanced search
- 🏷️ **Tag Management** - List and organize tags across collections
- ✨ **Highlight Support** - Create and manage text highlights with color coding
- ⚡ **Bulk Operations** - Update multiple bookmarks efficiently
- 🔗 **Resource Links** - Efficient data access using MCP resource link pattern
- 🛡️ **Type Safe** - Full TypeScript implementation with Zod validation
- ☁️ **Serverless Ready** - Deploy to Vercel
- 🔐 **OAuth 2.0 Authentication** - Secure multi-user access with PKCE flow
- 👥 **Multi-Tenant** - Support multiple users with per-request authentication
- 🔄 **Token Refresh** - Automatic token renewal without re-authentication
- 🔒 **Encrypted Storage** - AES-256-GCM encryption for tokens at rest

## MCP Best Practices Compliance

This server follows MCP (Model Context Protocol) best practices:

### ✅ Output Schemas
All 8 tools define structured output schemas using Zod, helping clients understand and process responses:
- `collection_list` → Collection list with counts
- `bookmark_search` → Paginated bookmark results
- `bookmark_statistics` → Quality metrics and tag distributions
- All manage tools → Operation results with resource URIs

### ✅ Tool Annotations
Every tool includes metadata hints:
- **readOnlyHint**: Identifies safe, read-only operations (search, list, statistics)
- **destructiveHint**: Warns about deletion operations
- **idempotentHint**: Indicates if operations can be safely retried

### ✅ Actionable Error Messages
Errors include:
- Context about what went wrong
- Specific examples of correct usage
- Guidance on how to find required IDs
- Warnings for destructive operations

Example:
```
Error: id required for update. Use bookmark_search to find bookmark IDs,
or check the raindrop://bookmark/{id} resource. Bookmark IDs are numeric
values returned by bookmark_search and visible in resource URIs.
```

### ✅ Comprehensive Evaluations
See `evaluations/raindrop.xml` for 10 realistic test questions that verify:
- Complex multi-tool workflows
- Search and filtering capabilities
- Cross-collection queries
- Statistical analysis
- AI-powered suggestions

### ✅ Resource Templates
Dynamic resources for exploring data:
- `raindrop://user/profile` - User information
- `raindrop://collections` - All collections
- `raindrop://collection/{id}` - Specific collection
- `raindrop://bookmark/{id}` - Specific bookmark

### ✅ Type Safety
- Full TypeScript implementation
- Zod validation for all inputs and outputs
- OpenAPI-generated types for Raindrop.io API

## Architecture

### System Overview

```mermaid
graph TB
	    subgraph "Client Layer"
	        Browser[Web Browser]
	        MCPClient[MCP Client SDK]
	    end

		    subgraph "Transport Layer"
		        Vercel[Vercel Functions<br/>api/raindrop.ts]
		    end

    subgraph "Authentication Layer"
        OAuth[OAuth Service<br/>PKCE Flow]
        TokenStorage[Token Storage<br/>AES-256 Encrypted]
        VercelKV[(Vercel KV<br/>Redis)]

        OAuth --> TokenStorage
        TokenStorage --> VercelKV
    end

	    subgraph "MCP Protocol Layer"
	        MCPService[MCP Server<br/>(mcp-handler)]

        subgraph "MCP Tools"
            CollectionTool[collection_list<br/>collection_manage]
            BookmarkTool[bookmark_search<br/>bookmark_manage]
            TagTool[tag_list]
            HighlightTool[highlight_manage]
            BulkTool[bulk_edit_bookmarks]
        end

        MCPService --> CollectionTool
        MCPService --> BookmarkTool
        MCPService --> TagTool
        MCPService --> HighlightTool
        MCPService --> BulkTool
    end

    subgraph "Service Layer"
        RaindropService[RaindropService<br/>API Client<br/>Type-Safe with openapi-fetch]
    end

    subgraph "External Services"
        RaindropAPI[Raindrop.io API<br/>REST API]
    end

	    %% Client connections
		    Browser -->|HTTPS| Vercel

	    %% Transport to MCP Service
		    Vercel -->|mcp-handler<br/>withMcpAuth| OAuth

    OAuth -->|Validated Token| MCPService

    %% MCP Service to Raindrop Service
    MCPService -->|Per-User Token| RaindropService

    %% Service to API
    RaindropService -->|HTTP Requests| RaindropAPI

    style OAuth fill:#e1f5ff
    style TokenStorage fill:#e1f5ff
    style MCPService fill:#fff4e1
    style RaindropService fill:#e8f5e9
    style RaindropAPI fill:#fce4ec
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Client as Client App
    participant Vercel as Vercel Function
    participant OAuth as OAuth Service
    participant KV as Vercel KV
    participant Raindrop as Raindrop.io

    User->>Client: Click "Connect Raindrop"
    Client->>Vercel: GET /auth/init?redirect_uri=/dashboard
    Vercel->>OAuth: initFlow()
    OAuth->>OAuth: Generate state + PKCE challenge
    OAuth->>KV: Store state & code_verifier
    OAuth->>Vercel: Return auth URL
    Vercel->>Client: Redirect to Raindrop OAuth
    Client->>Raindrop: Authorization request
    Raindrop->>User: Show authorization page
    User->>Raindrop: Approve access
    Raindrop->>Vercel: GET /auth/callback?code=XXX&state=YYY
    Vercel->>OAuth: handleCallback(code, state)
    OAuth->>KV: Verify state
    OAuth->>Raindrop: POST /oauth/access_token<br/>(code + code_verifier)
    Raindrop->>OAuth: access_token + refresh_token
    OAuth->>Raindrop: GET /user (fetch user info)
    Raindrop->>OAuth: User details
    OAuth->>OAuth: Encrypt tokens (AES-256-GCM)
    OAuth->>KV: Store encrypted session
    OAuth->>Vercel: Return session ID
    Vercel->>Client: Set-Cookie: mcp_session=XXX<br/>Redirect to /dashboard
    Client->>User: Authenticated!

    Note over User,Raindrop: Subsequent MCP Requests
    User->>Client: Use MCP tool
    Client->>Vercel: POST /mcp<br/>Cookie: mcp_session=XXX
    Vercel->>OAuth: verifyToken(session_id)
    OAuth->>KV: Get encrypted session
    KV->>OAuth: Encrypted tokens
    OAuth->>OAuth: Decrypt tokens
    OAuth->>OAuth: Check expiry
    alt Token expired
        OAuth->>Raindrop: Refresh token
        Raindrop->>OAuth: New access_token
        OAuth->>KV: Update session
    end
    OAuth->>Vercel: Valid access_token
    Vercel->>Raindrop: MCP operation with token
    Raindrop->>Vercel: Response
    Vercel->>Client: MCP result
```

### Multi-Tenant Architecture

```mermaid
graph LR
    subgraph "Shared Server Instance"
        Endpoint[MCP Endpoint<br/>/mcp]
        Auth[Auth Layer]

        subgraph "Request-Scoped Services"
            Service1[RaindropService<br/>User 1 Token]
            Service2[RaindropService<br/>User 2 Token]
            Service3[RaindropService<br/>User 3 Token]
        end
    end

    subgraph "Users"
        User1[👤 User 1<br/>Session/Token]
        User2[👤 User 2<br/>Session/Token]
        User3[👤 User 3<br/>Session/Token]
    end

    subgraph "Storage"
        KV[(Vercel KV<br/>Encrypted Sessions)]
    end

    User1 -->|Cookie: mcp_session=A| Endpoint
    User2 -->|X-Raindrop-Token: B| Endpoint
    User3 -->|Cookie: mcp_session=C| Endpoint

    Endpoint --> Auth
    Auth --> KV

    Auth -->|Token A| Service1
    Auth -->|Token B| Service2
    Auth -->|Token C| Service3

    Service1 -->|User 1 Data| API[Raindrop.io API]
    Service2 -->|User 2 Data| API
    Service3 -->|User 3 Data| API

    style Auth fill:#e1f5ff
    style KV fill:#fff4e1
    style API fill:#fce4ec
```

## Authentication Methods

Choose the authentication method that fits your use case:

| Method | Best For | Security | Multi-User | Setup |
|--------|----------|----------|------------|-------|
| **OAuth 2.0** | Production deployments | ⭐⭐⭐⭐⭐ | ✅ Yes | [OAuth Guide](docs/OAUTH.md) |
| **Direct Token** | Personal use, development | ⭐⭐⭐ | ❌ No | Quick (just token) |
| **Environment Token** | Local development only | ⭐⭐ | ❌ No | Easiest |

**OAuth 2.0** provides:
- Secure multi-user access without sharing tokens
- Automatic token refresh (no re-authentication needed)
- Encrypted token storage with AES-256-GCM
- PKCE flow for enhanced security

**Direct Token** is simpler for:
- Single-user personal deployments
- Quick development and testing
- When you don't need multi-tenant support


## Prerequisites

- Node.js v18+ or Bun runtime
- A Raindrop.io account
- **Authentication credentials** (choose one):
  - **OAuth**: OAuth app from [Raindrop Developer Console](https://raindrop.io/dev/apps) + Vercel KV
  - **Direct Token**: API token from [Raindrop Settings](https://app.raindrop.io/settings/integrations)

## Configuration

### For Vercel Deployment (OAuth)

OAuth authentication is configured via environment variables. See [OAuth Guide](docs/OAUTH.md) for full setup instructions.

**Required Environment Variables:**
- `OAUTH_CLIENT_ID` - Your OAuth app client ID
- `OAUTH_CLIENT_SECRET` - Your OAuth app client secret
- `OAUTH_REDIRECT_URI` - OAuth callback URL (e.g., `https://your-app.vercel.app/auth/callback`)
- `OAUTH_ALLOWED_REDIRECT_URIS` - Comma-separated list of allowed redirect URIs
- `TOKEN_ENCRYPTION_KEY` - 64-character hex key (generate with `openssl rand -hex 32`)

**Optional Environment Variables:**
- `API_KEY` - Server API key for endpoint protection (recommended for production)

## Quick Start
### Option 1: Deploy to Vercel

Deploy to Vercel's serverless platform with OAuth support.

```bash
# Install Vercel CLI
npm install -g vercel

# Login and deploy
vercel login
npm run deploy:vercel
```

**Choose authentication method:**

#### Option A: OAuth 2.0 (Recommended for Production)

1. Create OAuth app at [Raindrop Developer Console](https://raindrop.io/dev/apps)
2. Create Vercel KV database (Storage → Create Database → KV)
3. Link KV to your project
4. Set environment variables in Vercel dashboard:
   - `OAUTH_CLIENT_ID`
   - `OAUTH_CLIENT_SECRET`
   - `OAUTH_REDIRECT_URI` (e.g., `https://your-app.vercel.app/auth/callback`)
   - `OAUTH_ALLOWED_REDIRECT_URIS` (e.g., `https://your-app.com/dashboard,/dashboard`)
   - `TOKEN_ENCRYPTION_KEY` (generate with `openssl rand -hex 32`)
   - `KV_REST_API_URL` (auto-set when KV linked)
   - `KV_REST_API_TOKEN` (auto-set when KV linked)

Users authenticate via: `https://your-app.vercel.app/auth/init?redirect_uri=/dashboard`

📖 **Complete OAuth Setup**: [docs/OAUTH.md](docs/OAUTH.md)

#### Option B: Direct Token (Simple, Single-User)

Set environment variables in Vercel dashboard:
- `RAINDROP_ACCESS_TOKEN` (required)
- `API_KEY` (optional)

📖 **Full Deployment Guide**: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## MCP Endpoint & Authentication

### Endpoints

The deployed MCP endpoint is:
- `POST /mcp` (rewritten to `POST /api/raindrop` via `vercel.json`)

**OAuth Endpoints:**
- `GET /auth/init?redirect_uri=/dashboard` - Start OAuth flow
- `GET /auth/callback` - OAuth callback (handles Raindrop redirect)
- `GET /.well-known/oauth-protected-resource` - OAuth metadata

### Authentication

The server supports three authentication methods simultaneously:

#### Method 1: OAuth 2.0 Session (Recommended)

**Best for**: Production, multi-user applications

Users authenticate via browser:
```bash
# Step 1: User visits in browser
https://your-server.vercel.app/auth/init?redirect_uri=/dashboard

# Step 2: After Raindrop authorization, session cookie is set
# Cookie: mcp_session=xxx (httpOnly, secure)

# Step 3: Client includes cookie in requests
curl https://your-server.vercel.app/mcp \
  -H "Cookie: mcp_session=session_id_here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

**Security features:**
- PKCE flow (prevents code interception)
- State parameter (CSRF protection)
- Redirect URI allowlist (prevents open redirects)
- Encrypted token storage (AES-256-GCM)
- HttpOnly cookies (XSS protection)
- Automatic token refresh

📖 **Setup Guide**: [docs/OAUTH.md](docs/OAUTH.md)

#### Method 2: Direct Raindrop Token (Per-Request)

**Best for**: Personal use, development, API integrations

```bash
curl https://your-server.vercel.app/mcp \
  -H "X-API-Key: server_api_key" \
  -H "X-Raindrop-Token: user_raindrop_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Each user provides their own Raindrop token. No session storage required.

### Server Protection (Optional)

Add API key protection to your server:

```env
API_KEY=your_secret_server_key
```

All requests must include:
```bash
-H "X-API-Key: your_secret_server_key"
```

Recommended for production deployments to prevent unauthorized access.

### MCP Client Configuration

If your client supports Streamable HTTP, point it at `https://your-app.vercel.app/mcp`.
For stdio-only clients, use `mcp-remote`.

## Environment Variables

### Authentication Variables

**OAuth 2.0 (Recommended for Production)**

| Variable | Description | Required | How to Get |
|----------|-------------|----------|------------|
| `OAUTH_CLIENT_ID` | OAuth app client ID | For OAuth | [Create OAuth app](https://raindrop.io/dev/apps) |
| `OAUTH_CLIENT_SECRET` | OAuth app client secret | For OAuth | From OAuth app settings |
| `OAUTH_REDIRECT_URI` | OAuth callback URL | For OAuth | `https://your-app.vercel.app/auth/callback` |
| `OAUTH_ALLOWED_REDIRECT_URIS` | Comma-separated allowed redirect URIs | For OAuth | `https://app.com/dashboard,/dashboard` |
| `TOKEN_ENCRYPTION_KEY` | 64-char hex encryption key | For OAuth | `openssl rand -hex 32` |
| `KV_REST_API_URL` | Vercel KV endpoint | For OAuth | Auto-set when KV linked |
| `KV_REST_API_TOKEN` | Vercel KV token | For OAuth | Auto-set when KV linked |

**Direct Token (Simple/Development)**

| Variable | Description | Required | How to Get |
|----------|-------------|----------|------------|
| `RAINDROP_ACCESS_TOKEN` | Raindrop.io API token | Without OAuth | [Get token](https://app.raindrop.io/settings/integrations) |

### Server Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `API_KEY` | Server API key for endpoint protection | - | Recommended for production |
| `NODE_ENV` | Environment mode | development | No |

### Platform-Specific Setup

**Vercel**:
- Set environment variables in dashboard: Project → Settings → Environment Variables
- Link Vercel KV for OAuth: Storage → Connect Store
- `KV_REST_API_URL` and `KV_REST_API_TOKEN` are auto-set when KV linked

**📖 Complete Setup Guide**: See [OAuth Guide](docs/OAUTH.md) for step-by-step instructions

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

The server provides MCP resources for detailed data access. Tools typically return `resource_link` blocks pointing at these URIs, and clients can fetch full JSON using `resources/read`.

- `raindrop://user/profile` - Your Raindrop.io account information
- `raindrop://collections` - List of collections (JSON)
- `raindrop://collection/{id}` - Detailed collection data
- `raindrop://bookmark/{id}` - Detailed bookmark data

## Development

### Available Scripts

```bash
# Local development (Vercel)
npm run dev                  # vercel dev

# Utilities
npm run type-check           # TypeScript type checking
npm run test                 # Run tests
npm run clean                # Clean build directory
```

### Project Structure

```
raindrop-mcp/
├── src/
│   ├── services/
│   │   ├── raindrop.service.ts         # Raindrop.io API client
│   ├── types/
│   │   ├── raindrop.schema.d.ts        # API type definitions
│   │   └── raindrop-zod.schemas.ts     # Zod validation schemas
│   └── utils/
│       └── logger.ts                   # Logging utility
├── api/
│   ├── raindrop.ts                     # MCP endpoint (mcp-handler)
│   ├── auth/                           # OAuth endpoints
│   └── .well-known/                    # OAuth protected resource metadata
├── docs/
│   ├── DEPLOYMENT.md                   # Deployment guide
├── tests/                              # Test files
├── vercel.json                         # Vercel config
├── package.json
├── tsconfig.json
└── README.md
```

## Architecture

### Service Layers

1. **RaindropService** - Low-level API client
   - Type-safe API calls using openapi-fetch
   - Error handling and request/response interceptors
   - Direct mapping to Raindrop.io REST API
   - Supports custom tokens for multi-tenancy

2. **Vercel MCP handler** - MCP protocol layer
   - Exposes Raindrop functionality as MCP tools and resources
   - Request-scoped auth via OAuth session or per-request token

## Serverless Deployment

### Platform Comparison

| Feature | Vercel |
|---------|--------|
| **Cold Start** | ~500ms |
| **Free Tier** | 100GB bandwidth |
| **Execution Time** | 10s (hobby), 300s (pro) |
| **Global CDN** | Yes |
| **Node.js Support** | Full |
| **Custom Domains** | Yes (free SSL) |
| **Best For** | Node.js apps |

### Deployment Commands

```bash
# Vercel
npm run deploy:vercel
```

## Usage Examples

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

## Testing

### Running Tests

Some tests require a valid `RAINDROP_ACCESS_TOKEN` in your `.env` file:

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/raindrop.service.test.ts

# Watch mode
npm test --watch

# With coverage
npm test --coverage
```

### Test Deployments

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test deployed endpoint
curl https://your-app.vercel.app/health
```

## Troubleshooting

### Common Issues

**1. "RAINDROP_ACCESS_TOKEN is required" Error**
- Create `.env` file in project root
- Get token from https://app.raindrop.io/settings/integrations
- Add as: `RAINDROP_ACCESS_TOKEN=your_token_here`

**2. 401 Unauthorized**
- Check `API_KEY` environment variable
- Verify `X-API-Key` header matches

**4. 500 Internal Server Error**
- Verify Raindrop token is valid
- Check server logs for details
- Ensure environment variables are set

**4. Request Timeouts**
- Vercel: requests have time limits; keep operations bounded and paginate where possible

### View Logs

```bash
# Vercel
vercel logs your-project

# Local
# Logs appear in console
```

## Security Best Practices

1. ✅ **Use HTTPS** in production (automatic with Vercel)
2. ✅ **Set API_KEY** for HTTP deployments
3. ✅ **Use per-user tokens** for multi-tenant deployments
4. ✅ **Rotate API keys** regularly
5. ✅ **Monitor logs** for suspicious activity
6. ✅ **Keep dependencies updated**

## Documentation

- 📖 [OAuth Guide](docs/OAUTH.md) - **NEW!** Complete OAuth 2.0 setup and troubleshooting
- 📖 [Deployment Guide](docs/DEPLOYMENT.md) - Vercel deployment with OAuth and direct token

## Performance

### Optimization Tips

- **Vercel**: Increase function memory, choose optimal region
- **HTTP**: Enable gzip compression, implement caching
- **All**: Minimize dependencies, use tree-shaking

### Monitoring

- **Vercel**: Built-in analytics in dashboard
- **Custom**: Implement health checks and error tracking

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
git clone https://github.com/Aarekaz/raindrop-mcp.git
cd raindrop-mcp
npm install
cp .env.example .env
# Add your RAINDROP_ACCESS_TOKEN to .env
npm run dev
```

## License

MIT License - see LICENSE file for details

## Author

**Anurag Dhungana**

- GitHub: [@Aarekaz](https://github.com/Aarekaz)
- Email: anuragdhungana5@gmail.com

## Acknowledgments

- Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Raindrop.io API documentation: https://developer.raindrop.io
- Inspired by the MCP community
- Thanks to all contributors!

## Links

- 🔗 [GitHub Repository](https://github.com/Aarekaz/raindrop-mcp)
- 🔗 [Raindrop.io](https://raindrop.io)
- 🔗 [Model Context Protocol](https://modelcontextprotocol.io)
- 🔗 [Report Issues](https://github.com/Aarekaz/raindrop-mcp/issues)
- 🔗 [Discussions](https://github.com/Aarekaz/raindrop-mcp/discussions)

## Roadmap

- [ ] WebSocket transport support
- [ ] AWS Lambda adapter
- [ ] Rate limiting middleware
- [ ] Response caching layer
- [ ] Metrics and monitoring dashboard
- [ ] OAuth integration
- [ ] GraphQL API support
- [ ] Webhook notifications

---

**⭐ If you find this project useful, please consider giving it a star on GitHub!**
