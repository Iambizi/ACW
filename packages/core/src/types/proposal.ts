/**
 * @file packages/core/src/types/proposal.ts
 * @description Single source of truth for the Warden application.
 * All modules must import their core types from this file.
 */

// State Machine for the AI Agent Wallet Console
export type ProposalStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'AUTO_APPROVED'
  | 'EXECUTING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'FAILED';

export type RiskLevel = 'low' | 'medium' | 'high';

export const CONFIDENCE_THRESHOLDS = {
  BLOCK_EXECUTION: 0.5,
  REQUEST_CLARIFICATION: 0.7,
  AUTO_APPROVE_ELIGIBLE: 0.95,
} as const;

export interface TxStep {
  /** Human-readable explanation of this step (e.g. "Approve USDC spend") */
  description: string;
  /** The destination address for the transaction */
  to: `0x${string}`;
  /** The value mapped to transaction value (in wei) */
  value: bigint;
  /** The transaction calldata payload */
  data: `0x${string}`;
  /** ID of the chain for this step */
  chainId: number;
}

export type ParsedIntent =
  | { type: 'swap'; fromToken: string; toToken: string; fromAmount: bigint; rawConfidence: number; ambiguities: string[] }
  | { type: 'transfer'; toAddress: `0x${string}`; amount: bigint; token: string; rawConfidence: number; ambiguities: string[] }
  | { type: 'stake'; token: string; amount: bigint; protocol: string; rawConfidence: number; ambiguities: string[] }
  | { type: 'unknown'; rawConfidence: number; ambiguities: string[] };

export interface ToolTraceEntry {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: number;
  durationMs: number;
}

/**
 * The core contract for any action in Warden.
 * Nothing executes without a ProposalObject in the PENDING_APPROVAL state.
 */
export interface ProposalObject {
  /** UUID of the proposal */
  id: string;
  /** Unix timestamp in ms */
  createdAt: number;
  /** Current state in the state machine */
  status: ProposalStatus;
  /** Natural language input provided by the user */
  rawInput: string;
  /** The resolved, structured intent from the AI interpreter */
  parsedIntent: ParsedIntent;
  /** The on-chain transaction steps required (min lengths: 1) */
  txPath: TxStep[];
  /** Expected overall gas cost */
  estimatedGas: bigint;
  /** Unix timestamp in ms when the proposal expires */
  deadline: number;
  /** Final resolved confidence score (0 to 1) */
  confidence: number;
  /** Risk assessment heuristic level */
  riskLevel: RiskLevel;
  /** User-facing flags or warnings generated during resolution/simulation */
  warnings: string[];
  /** Immutable log of every agent tool call */
  toolTrace: ToolTraceEntry[];

  // Lifecycle execution tracking (optional until execution starts)
  approvedAt?: number;
  rejectedAt?: number;
  txHash?: `0x${string}`;
  failureReason?: string;
}
