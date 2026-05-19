# Xray Cloud MCP Server

An MCP (Model Context Protocol) server that exposes Xray Cloud test management operations as tools — enabling AI assistants to create/update test cases and test sets via natural language.

## Features

| Tool | Description |
|------|-------------|
| `create_test_case` | Create a Manual, Cucumber, or Generic test case with steps |
| `update_test_case` | Update summary, steps, type, labels, priority, folder |
| `get_test_case` | Retrieve full test case details (supports both Jira key and internal ID) |
| `create_test_set` | Create a test set, optionally pre-populated with tests |
| `update_test_set` | Add/remove tests, update fields and folder |
| `get_test_set` | Retrieve test set details and member tests |

## Prerequisites

- Node.js 18+
- Xray Cloud API credentials (Client ID + Client Secret)
  - Generate at: **Xray Cloud → Settings → API Keys**

## Quick Start (for Teams)

No cloning or local setup needed. Just add this to `.vscode/mcp.json` in any project:

```json
{
  "servers": {
    "xray": {
      "type": "stdio",
      "command": "npx",
      "args": ["github:basel68/xray-mcp-server"],
      "env": {
        "XRAY_CLIENT_ID": "${input:xrayClientId}",
        "XRAY_CLIENT_SECRET": "${input:xrayClientSecret}"
      }
    }
  },
  "inputs": [
    {
      "id": "xrayClientId",
      "type": "promptString",
      "description": "Xray Cloud Client ID"
    },
    {
      "id": "xrayClientSecret",
      "type": "promptString",
      "description": "Xray Cloud Client Secret",
      "password": true
    }
  ]
}
```

That's it — `npx` downloads and runs the latest version from GitHub automatically.

## Local Development Setup

```bash
git clone https://github.com/basel68/xray-mcp-server.git
cd xray-mcp-server
npm install
npm run build
npm start
```

## VS Code / Copilot Integration (Alternative Options)

### Option A: npx from GitHub (Recommended)

See **Quick Start** above.

### Option B: Clone and Run Locally

```bash
git clone https://github.com/basel68/xray-mcp-server.git
cd xray-mcp-server
npm install
```

Then use this `.vscode/mcp.json`:

```json
{
  "servers": {
    "xray": {
      "type": "stdio",
      "command": "node",
      "args": ["<path-to-clone>/dist/index.js"],
      "env": {
        "XRAY_CLIENT_ID": "${input:xrayClientId}",
        "XRAY_CLIENT_SECRET": "${input:xrayClientSecret}"
      }
    }
  },
  "inputs": [
    {
      "id": "xrayClientId",
      "type": "promptString",
      "description": "Xray Cloud Client ID"
    },
    {
      "id": "xrayClientSecret",
      "type": "promptString",
      "description": "Xray Cloud Client Secret",
      "password": true
    }
  ]
}
```

### Option C: Global Install

```bash
npm install -g git+https://github.com/basel68/xray-mcp-server.git
```

Then:

```json
{
  "servers": {
    "xray": {
      "type": "stdio",
      "command": "xray-mcp-server",
      "env": {
        "XRAY_CLIENT_ID": "${input:xrayClientId}",
        "XRAY_CLIENT_SECRET": "${input:xrayClientSecret}"
      }
    }
  }
}
```

## Architecture

```
src/
├── index.ts           # MCP server setup (stdio transport)
├── xray-client.ts     # GraphQL client for Xray Cloud API
├── types.ts           # Shared types and error classes
├── auth/
│   ├── AuthManager.ts # JWT authentication with caching
│   ├── CredentialStore.ts # Credential resolution from env
│   └── WriteGuard.ts  # Read/write access control
├── clients/
│   └── HttpClient.ts  # HTTP request layer
└── tools/
    ├── registry.ts    # Tool self-registration system
    ├── test-cases.ts  # Create/update/get test cases
    └── test-sets.ts   # Create/update/get test sets
```

## API Reference

This server uses the [Xray Cloud GraphQL API](https://docs.getxray.app/display/XRAYCLOUD/GraphQL+API) for all operations. Authentication is handled via the `/api/v2/authenticate` endpoint with client credentials.

## Notes

- `get_test_case` accepts both Jira keys (e.g. `PROJ-123`) and internal Xray issue IDs (e.g. `1707465`). If a Jira key is provided, it resolves the internal ID via JQL automatically.
- Updates to `main` branch are picked up automatically on next server restart (npx fetches latest).
