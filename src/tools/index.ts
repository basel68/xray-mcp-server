/**
 * Barrel: importing this file registers all tools via side effects.
 * Each tool module calls registerTool() when imported.
 */

// Critical: must run BEFORE createServer() in index.ts
import "./test-cases.js";
import "./test-sets.js";

export { TOOL_REGISTRY, registerTool } from "./registry.js";
