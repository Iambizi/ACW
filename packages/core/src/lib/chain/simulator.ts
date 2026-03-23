import { publicClient } from './client';
import type { TxStep } from '../../types';

export interface SimulationResult {
  success: boolean;
  error?: string;
  gasEstimated?: bigint;
}

/**
 * Simulates a proposed transaction path via eth_call to catch guaranteed reverts.
 * No transaction should reach PENDING_APPROVAL if this simulation fails.
 * 
 * Note: Simulating sequences locally against live state does not catch state-dependent 
 * failures between consecutive steps in the same block without state overrides (v2 scope).
 */
export async function simulateTxPath(
  steps: TxStep[],
  userAddress: `0x${string}`
): Promise<SimulationResult> {
  if (steps.length === 0) {
    return { success: false, error: 'No transaction steps provided for simulation.' };
  }

  let totalGas = 0n;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      // Verify the call doesn't revert
      await publicClient.call({
        account: userAddress,
        to: step.to,
        data: step.data,
        value: step.value,
      });

      // Fetch network-aware gas estimation
      const estimatedGas = await publicClient.estimateGas({
        account: userAddress,
        to: step.to,
        data: step.data,
        value: step.value,
      });
      
      totalGas += estimatedGas;
    } catch (error) {
      return { 
        success: false, 
        error: `Simulation failed at step ${i + 1} (${step.description}): ${(error as any).shortMessage || (error as Error).message}` 
      };
    }
  }

  return { success: true, gasEstimated: totalGas };
}
