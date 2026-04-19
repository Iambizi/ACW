import { encodeFunctionData, erc20Abi } from 'viem';
import type { ParsedIntent, TxStep } from '../../types';

export interface QuoteResult {
  steps: TxStep[];
  estimatedGasTotal: bigint;
}

// ERC-20 tokens that are NOT native ETH and require an allowance approve step.
// Native ETH transfers (value > 0, no token address) skip this entirely.
const NATIVE_ETH_SYMBOLS = new Set(['ETH', 'WETH', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee']);

/**
 * Fetches a swap quote from 0x API and constructs the necessary execution steps.
 *
 * Multi-step output:
 *   - If sellToken is an ERC-20 and `allowanceTarget` is returned by 0x, an
 *     `approve(allowanceTarget, sellAmount)` step is prepended as txPath[0].
 *   - The swap calldata itself becomes txPath[1] (or txPath[0] for ETH sells).
 *
 * This ensures `useExecuteProposal` can chain the approve → swap atomically.
 */
export async function fetch0xQuote(
  intent: Extract<ParsedIntent, { type: 'swap' }>,
  userAddress: `0x${string}`,
  chainId: number = 84532 // base sepolia default
): Promise<QuoteResult> {
  const apiKey = process.env.ZERO_EX_API_KEY;
  if (!apiKey) throw new Error('ZERO_EX_API_KEY is not set');

  const params = new URLSearchParams({
    sellToken: intent.fromToken,
    buyToken: intent.toToken,
    sellAmount: intent.fromAmount.toString(),
    takerAddress: userAddress,
  });

  // 0x v2 swap API — includes permit2 support and improved routing.
  const response = await fetch(`https://api.0x.org/swap/v2/quote?${params.toString()}`, {
    headers: {
      '0x-api-key': apiKey,
      '0x-chain-id': chainId.toString(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`0x API error: ${response.status} ${errorText}`);
  }

  const quote = await response.json();
  const steps: TxStep[] = [];
  let estimatedGasTotal = 0n;

  // --- Step 1: ERC-20 Approve (conditional) ---
  // 0x returns `allowanceTarget` when the sell token needs an allowance.
  // Native ETH sells do not require approval — skip them.
  const isNativeSell = NATIVE_ETH_SYMBOLS.has(intent.fromToken.toLowerCase());
  if (!isNativeSell && quote.allowanceTarget && quote.allowanceTarget !== '0x0000000000000000000000000000000000000000') {
    // Encode ERC-20 approve(spender, amount) via viem — avoids raw ABI strings.
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [quote.allowanceTarget as `0x${string}`, intent.fromAmount],
    });

    // Gas for an ERC-20 approve is typically ~46k — use a safe buffer.
    const approveGas = 65_000n;
    estimatedGasTotal += approveGas;

    steps.push({
      description: `Approve ${intent.fromToken} spend to 0x router`,
      to: intent.fromToken as `0x${string}`, // The token contract itself
      value: 0n,
      data: approveData,
      chainId,
    });
  }

  // --- Step 2: Swap execution calldata ---
  const swapGas = BigInt(quote.estimatedGas || '0');
  estimatedGasTotal += swapGas;

  steps.push({
    description: `Swap ${intent.fromAmount.toString()} ${intent.fromToken} for ${intent.toToken} via 0x`,
    to: quote.to as `0x${string}`,
    value: BigInt(quote.value || '0'),
    data: quote.data as `0x${string}`,
    chainId,
  });

  return {
    steps,
    estimatedGasTotal,
  };
}
