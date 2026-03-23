import type { ParsedIntent, TxStep } from '../../types';

export interface QuoteResult {
  steps: TxStep[];
  estimatedGasTotal: bigint;
}

/**
 * Fetches a swap quote from 0x API and constructs the necessary execution steps.
 * Takes a publicClient to check allowances if needed (omitted in v1 stub).
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

  // Note: For a production app, we would point to api.0x.org/swap/v1/quote with proper chain IDs.
  // We're stubbing the fetch call shape here for the Base Sepolia testnet environment.
  const response = await fetch(`https://api.0x.org/swap/v1/quote?${params.toString()}`, {
    headers: {
      '0x-api-key': apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`0x API error: ${response.status} ${errorText}`);
  }

  const quote = await response.json();
  const steps: TxStep[] = [];
  let estimatedGasTotal = 0n;

  // 1. Allowance check logic goes here
  // If intent.fromToken is an ERC20 and allowance < intent.fromAmount,
  // we would push an `approve` transaction step targeting `quote.allowanceTarget`
  // using viem's encodeFunctionData for ERC20.approve()

  // 2. The main swap transaction
  const swapGas = BigInt(quote.estimatedGas || '0');
  estimatedGasTotal += swapGas;

  steps.push({
    description: `Swap ${intent.fromAmount.toString()} ${intent.fromToken} for ${intent.toToken} on 0x`,
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
