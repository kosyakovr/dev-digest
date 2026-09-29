/**
 * Boundary (ring ④) — the two result shapes every tool returns
 * (Contract § Common output). May import everything except `api/` values.
 */

export interface ToolTextContent {
  type: 'text';
  text: string;
}

// The SDK's `CallToolResult` carries an index signature (it is a Zod object
// type with passthrough-shaped extras) — match it structurally so a
// `registerTool` callback returning this type satisfies `ToolCallback`.
export interface ToolSuccessResult {
  [x: string]: unknown;
  content: ToolTextContent[];
  structuredContent: Record<string, unknown>;
}

export interface ToolErrorResult {
  [x: string]: unknown;
  content: ToolTextContent[];
  isError: true;
}

export type ToolCallResult = ToolSuccessResult | ToolErrorResult;

export function toolResult(sc: Record<string, unknown>): ToolSuccessResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(sc) }],
    structuredContent: sc,
  };
}

export function toolError(text: string): ToolErrorResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}
