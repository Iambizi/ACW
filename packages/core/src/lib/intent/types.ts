import type { ParsedIntent, ToolTraceEntry } from '../../types';

export interface ParseResult {
  intent: ParsedIntent;
  toolTrace: ToolTraceEntry;
}

export interface IntentParser {
  /**
   * Parses natural language into a structured, cryptographically strict intent.
   * Returns the `ParsedIntent` along with an auditable `ToolTraceEntry` tracking the parse performance.
   */
  parse(input: string): Promise<ParseResult>;
}
