import { v4 as uuidv4 } from 'uuid';
import { claudeParser } from './intent';
import { fetch0xQuote } from './quote';
import { simulateTxPath } from './chain';
import { evaluateRisk } from './risk';
import { proposalStore } from '../store';
import type { ProposalObject, TxStep } from '../types';

export interface OrchestrationResult {
  proposal: ProposalObject;
  simulationError?: string;
}

/**
 * The core orchestration pipeline.
 * Takes natural language and drives it through the entire Warden architecture:
 * Intent Parse -> 0x Quote -> Simulation -> Risk Eval -> State Store.
 */
export async function constructProposal(
  input: string,
  userAddress: `0x${string}`,
  chainId: number = 84532
): Promise<OrchestrationResult> {
  const proposalId = uuidv4();
  
  // 1. Resolve Intent
  const parseResult = await claudeParser.parse(input);
  const intent = parseResult.intent;

  let steps: TxStep[] = [];
  let estimatedGasTotal = 0n;

  // 2. Route & Quote (only for swaps right now, transfers/stakes need proper router mapping in v2)
  if (intent.type === 'swap') {
    try {
      const quote = await fetch0xQuote(intent, userAddress, chainId);
      steps = quote.steps;
      estimatedGasTotal = quote.estimatedGasTotal;
    } catch (e) {
      intent.ambiguities.push(`Quote routing failed: ${(e as Error).message}`);
    }
  }

  // 3. Simulate Path
  const simResult = await simulateTxPath(steps, userAddress);
  if (!simResult.success && simResult.error) {
    intent.ambiguities.push(`Simulation failed: ${simResult.error}`);
  }

  // 4. Evaluate Risk
  const risk = evaluateRisk(intent, steps, intent.rawConfidence);

  // 5. Construct Contract Object
  const proposal: ProposalObject = {
    id: proposalId,
    createdAt: Date.now(),
    status: 'PENDING_APPROVAL', // Supervised IMDA L3 default
    rawInput: input,
    parsedIntent: intent,
    txPath: steps,
    estimatedGas: estimatedGasTotal,
    deadline: Date.now() + 1000 * 60 * 15, // 15 min expiry
    confidence: intent.rawConfidence,
    riskLevel: risk.riskLevel,
    warnings: risk.warnings,
    toolTrace: [parseResult.toolTrace],
  };

  // 6. Automatically fail if simulation failed outright
  if (!simResult.success) {
    proposal.status = 'FAILED';
    proposal.failureReason = simResult.error;
  }

  // 7. Save to strict global store
  proposalStore.getState().addProposal(proposal);

  return {
    proposal,
    simulationError: simResult.success ? undefined : simResult.error,
  };
}
