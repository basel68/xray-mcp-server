/**
 * Shared type definitions and error classes for the Xray MCP server.
 */

// ============================================================================
// Error Types
// ============================================================================

/**
 * Thrown on 401/403 authentication failures or missing credentials.
 * Includes actionable hints for debugging.
 */
export class XrayAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XrayAuthError";
    Object.setPrototypeOf(this, XrayAuthError.prototype);
  }
}

/**
 * Thrown on non-2xx HTTP responses (excluding 401/403 auth errors).
 * Includes the HTTP status code for caller handling.
 */
export class XrayHttpError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "XrayHttpError";
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, XrayHttpError.prototype);
  }
}

/**
 * Thrown when GraphQL response contains errors array without usable data.
 * Stores the raw GraphQL error objects for caller inspection.
 */
export class XrayGqlError extends Error {
  public readonly errors: Array<{ message: string; path?: string[]; extensions?: Record<string, unknown> }>;

  constructor(errors: Array<{ message: string; path?: string[]; extensions?: Record<string, unknown> }>) {
    super(errors.map((e) => e.message).join("; "));
    this.name = "XrayGqlError";
    this.errors = errors;
    Object.setPrototypeOf(this, XrayGqlError.prototype);
  }
}

// ============================================================================
// Credential Types
// ============================================================================

/**
 * Xray Cloud API regional endpoint identifier.
 */
export type XrayRegion = "us" | "eu" | "au" | "global";

/**
 * Credential sharing mode controlling tool access.
 * - `strict`: All operations require user credentials (default, most secure)
 * - `shared-reads`: Shared credentials for reads; user credentials for writes
 * - `fully-shared`: Single credential set for all operations
 */
export type CredentialMode = "strict" | "shared-reads" | "fully-shared";

/**
 * Access level for tools (used by WriteGuard).
 */
export type AccessLevel = "read" | "write";

/**
 * Xray Cloud API credentials for JWT authentication.
 */
export interface CloudCredentials {
  xrayClientId: string;
  xrayClientSecret: string;
  xrayRegion: XrayRegion;
}

/**
 * Resolved credential context including source metadata.
 */
export interface AuthContext {
  credentials: CloudCredentials;
  source: "env" | "header";
}

// ============================================================================
// Tool Types
// ============================================================================

/**
 * Per-request context passed to every tool handler.
 */
export interface ToolContext {
  auth: AuthContext;
  format: "toon" | "json" | "summary";
}

/**
 * Defines a single MCP tool.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  accessLevel: AccessLevel;
  inputSchema: any; // Zod schema
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

/**
 * Standard MCP tool response shape.
 */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// ============================================================================
// GraphQL Types
// ============================================================================

/**
 * Typed GraphQL response envelope.
 */
export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; path?: string[]; extensions?: Record<string, unknown> }>;
}
