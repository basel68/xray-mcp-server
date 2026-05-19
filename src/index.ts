#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { authManager } from "./auth/AuthManager.js";
import { CredentialStore } from "./auth/CredentialStore.js";
import { WriteGuard } from "./auth/WriteGuard.js";
import { HttpClient } from "./clients/HttpClient.js";
import { XrayClient } from "./xray-client.js";
import { TOOL_REGISTRY } from "./tools/index.js";
import type { ToolContext } from "./types.js";

// --- Configuration ---
const PORT = parseInt(process.env.PORT || "3000", 10);
const TRANSPORT = process.env.TRANSPORT || "stdio"; // "stdio" or "sse"

/**
 * Creates and configures an MCP server with all Xray tools registered.
 * Per D-10: Lazy credential validation — credentials are only resolved
 * when the first tool call is made, not at server startup.
 */
function createServer() {
  const credentialStore = new CredentialStore();
  const server = new McpServer({
    name: "xray-mcp-server",
    version: "1.0.0",
  });

  // Register all tools from the registry (populated by side-effect imports)
  for (const tool of TOOL_REGISTRY) {
    // Create the tool handler wrapper
    const toolHandler = async (args: Record<string, unknown>) => {
      try {
        // Step 1: Resolve credentials (lazy validation — only now, not at startup)
        const auth = credentialStore.resolveFromEnv();
        const mode = credentialStore.getCredentialMode();
        const writeGuard = new WriteGuard(mode);

        // Step 2: Enforce read/write policy
        writeGuard.checkAccess(tool.accessLevel, auth);

        // Step 3: Build clients for this request
        const httpClient = new HttpClient();
        const client = new XrayClient(
          httpClient,
          () => authManager.getCloudToken(auth.credentials)
        );

        // Step 4: Determine output format
        const format = (args.format as string) ?? "toon";

        const ctx: ToolContext = { auth, format: format as "toon" | "json" | "summary" };

        // Step 5: Inject client and call handler
        const result = await tool.handler({ ...args, _client: client }, ctx);
        
        // Ensure proper MCP response format
        return {
          content: result.content,
          isError: result.isError ?? false,
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    };

    // SDK v1.29.0 expects the raw Zod shape (.shape), not the ZodObject instance
    server.tool(
      tool.name,
      tool.inputSchema.shape,
      toolHandler as any
    );
  }

  return server;
}

// --- Transport Selection ---
if (TRANSPORT === "sse") {
  // SSE Transport via Express
  const app = express();
  const transports: Record<string, any> = {};

  app.get("/sse", async (req, res) => {
    // TODO: Implement SSE transport with proper per-request isolation
    res.status(501).json({ error: "SSE transport not yet implemented" });
  });

  app.post("/messages", express.json(), async (req, res) => {
    // TODO: Implement SSE message handling
    res.status(501).json({ error: "SSE transport not yet implemented" });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "xray-mcp-server", version: "1.0.0" });
  });

  app.listen(PORT, () => {
    console.log(`Xray MCP Server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
} else {
  // Stdio Transport (default)
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport);
}
