import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

/**
 * The core read-only connection to the blockchain. 
 * Used for fetching balances, allowances, and simulating transactions.
 */
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
