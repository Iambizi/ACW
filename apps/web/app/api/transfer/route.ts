import { NextResponse } from 'next/server';
import { encodeFunctionData, erc20Abi, isAddress } from 'viem';
import { evaluateRisk } from '@warden/core';
import type { ParsedIntent, TxStep } from '@warden/core';

// Base Sepolia token registry — symbol → contract address
const TOKEN_REGISTRY: Record<string, `0x${string}`> = {
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  WETH: '0x4200000000000000000000000000000000000006',
};

const NATIVE_ETH_SYMBOLS = new Set(['ETH', 'eth']);

/**
 * POST /api/transfer
 *
 * Builds a TxStep for a transfer intent without requiring a 0x quote.
 *
 * - Native ETH: sends `value` directly to `toAddress`.
 * - ERC-20: encodes `transfer(to, amount)` against the token contract.
 *
 * Returns: { txPath: TxStep[], riskLevel, warnings }
 */
export async function POST(req: Request) {
  try {
    const { parsedIntent, userAddress } = await req.json() as {
      parsedIntent: Extract<ParsedIntent, { type: 'transfer' }>;
      userAddress: `0x${string}`;
    };

    if (!parsedIntent || parsedIntent.type !== 'transfer') {
      return NextResponse.json({ error: 'Expected a transfer intent' }, { status: 400 });
    }

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ error: 'Missing or invalid userAddress' }, { status: 400 });
    }

    // Re-hydrate BigInt that was serialized to string over HTTP
    const amount: bigint = BigInt(parsedIntent.amount as unknown as string);
    const toAddress = parsedIntent.toAddress as `0x${string}`;
    const token = parsedIntent.token?.toUpperCase() ?? 'ETH';

    const steps: TxStep[] = [];
    const chainId = 84532; // Base Sepolia

    if (NATIVE_ETH_SYMBOLS.has(token)) {
      // Native ETH transfer — no calldata needed.
      steps.push({
        description: `Send ${formatAmount(amount, 18)} ETH to ${truncateAddr(toAddress)}`,
        to: toAddress,
        value: amount,
        data: '0x',
        chainId,
      });
    } else {
      // ERC-20 transfer — look up the token contract address.
      const tokenAddress = TOKEN_REGISTRY[token] ?? (isAddress(token) ? (token as `0x${string}`) : null);

      if (!tokenAddress) {
        return NextResponse.json(
          { error: `Unknown token symbol: ${token}. Add it to the registry or use a contract address.` },
          { status: 400 }
        );
      }

      const transferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [toAddress, amount],
      });

      const decimals = token === 'USDC' ? 6 : 18;

      steps.push({
        description: `Send ${formatAmount(amount, decimals)} ${token} to ${truncateAddr(toAddress)}`,
        to: tokenAddress,
        value: 0n,
        data: transferData,
        chainId,
      });
    }

    const risk = evaluateRisk(parsedIntent, steps, parsedIntent.rawConfidence);

    // Serialize BigInt fields to strings for JSON transport
    const serializedSteps = steps.map((s) => ({
      ...s,
      value: s.value.toString(),
    }));

    return NextResponse.json({
      txPath: serializedSteps,
      estimatedGas: '21000', // baseline ETH transfer gas; ERC-20 is ~65k but paymaster handles it
      riskLevel: risk.riskLevel,
      warnings: risk.warnings,
    });

  } catch (error) {
    console.error('Transfer build failed:', error);
    return NextResponse.json({ error: 'Transfer construction failed' }, { status: 500 });
  }
}

// --- Helpers ---

function formatAmount(wei: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = wei / divisor;
  const remainder = wei % divisor;
  if (remainder === 0n) return whole.toString();
  const frac = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${frac}`;
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
