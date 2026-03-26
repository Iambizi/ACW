import type { ToolTraceEntry } from '../../types';

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

/**
 * The output shape produced by any ResearchAgent implementation.
 * Uses ToolTraceEntry from proposal.ts to maintain a consistent
 * audit trail format across both the intent and research pipelines.
 */
export interface ResearchResult {
  summary: string;
  toolTrace: ToolTraceEntry[];
  query: string;
  timestamp: number;
  durationMs: number;
  thinkingLevel: ThinkingLevel;
}

/**
 * The stable contract for all research agent implementations.
 * Any model can be swapped in by creating a new file that satisfies
 * this interface — geminiResearchAgent is the v1 implementation.
 * Future implementations (DeepSeek V3.2, Claude Sonnet, etc.) swap
 * out a single file without touching any downstream consumer.
 */
export interface ResearchAgent {
  research(
    input: string,
    thinkingLevel?: ThinkingLevel
  ): Promise<ResearchResult>;
}
