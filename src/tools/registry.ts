import type { ToolDefinition } from "../types.js";

/**
 * Global tool registry — populated by side-effect imports.
 * All tools self-register when their module is imported.
 */
export const TOOL_REGISTRY: ToolDefinition[] = [];

export function registerTool(tool: ToolDefinition): void {
  TOOL_REGISTRY.push(tool);
}
