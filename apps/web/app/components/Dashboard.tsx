'use client';

import { useBalance, useReadContracts } from 'wagmi';
import { formatUnits, erc20Abi } from 'viem';
import { useStore } from 'zustand';
import { proposalStore } from '@warden/core';
import type { ProposalObject } from '@warden/core';

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const BASE_SEPOLIA_TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006' as const,
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
};

export function Dashboard({ address }: { address?: `0x${string}` }) {
  const { data: tokenData, isLoading: tokensLoading } = useReadContracts({
    contracts: address ? [
      { address: BASE_SEPOLIA_TOKENS.WETH, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
      { address: BASE_SEPOLIA_TOKENS.USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
    ] : [],
  });

  const wethBalance = tokenData?.[0]?.result ? formatUnits(tokenData[0].result, 18) : "0.00";
  // USDC uses 6 decimals
  const usdcBalance = tokenData?.[1]?.result ? formatUnits(tokenData[1].result, 6) : "0.00";

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <NativeBalanceCard address={address} />
        <div className="col-span-1 md:col-span-2 border border-zinc-200/50 rounded-2xl bg-white/50 backdrop-blur-xl p-6 shadow-sm">
          <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-4">Portfolio Assets</h3>
          <div className="flex flex-col gap-3">
            {tokensLoading ? (
               <div className="flex flex-col gap-3">
                 <div className="h-12 bg-zinc-100 animate-pulse rounded-lg" />
                 <div className="h-12 bg-zinc-100 animate-pulse rounded-lg" />
               </div>
            ) : (
               <>
                 <AssetRow symbol="WETH" balance={parseFloat(wethBalance).toFixed(4)} price="$3,500.00" value={`$${(parseFloat(wethBalance) * 3500).toFixed(2)}`} />
                 <AssetRow symbol="USDC" balance={parseFloat(usdcBalance).toFixed(2)} price="$1.00" value={`$${(parseFloat(usdcBalance) * 1).toFixed(2)}`} />
               </>
            )}
            <div className="text-xs text-zinc-400 mt-2 font-mono border-t border-zinc-100 pt-2">
              Live ERC-20 balances from Base Sepolia.
            </div>
          </div>
        </div>
      </div>

      <ProvenanceLog />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProvenanceLog — unified manual + AI-initiated transaction history
// ---------------------------------------------------------------------------

/**
 * A single Zustand-backed list of all proposals in terminal states,
 * sorted newest-first. Origin is inferred from whether rawInput looks
 * like a natural language string (agent) or a structured form label (manual).
 * We tag origin at the store level via a lightweight convention:
 * manual proposals set rawInput to "manual:send" or "manual:swap".
 */
function ProvenanceLog() {
  const proposals = useStore(proposalStore, (state: any) => state.proposals);
  const terminal: ProposalObject[] = (Object.values(proposals) as ProposalObject[])
    .filter((p) => ['CONFIRMED', 'REJECTED', 'FAILED', 'EXPIRED'].includes(p.status))
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="border border-zinc-200/50 rounded-2xl bg-white/50 backdrop-blur-xl p-6 min-h-48 shadow-sm">
      <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-4">Transaction History</h3>

      {terminal.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-sm text-zinc-400">
          No completed transactions yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {terminal.map((p) => (
            <ProvenanceRow key={p.id} proposal={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProvenanceRow({ proposal }: { proposal: ProposalObject }) {
  const isManual = proposal.rawInput?.startsWith('manual:');
  const origin = isManual ? 'manual' : 'agent';

  const statusStyle: Record<string, string> = {
    CONFIRMED: 'text-emerald-400',
    REJECTED:  'text-zinc-500',
    FAILED:    'text-red-400',
    EXPIRED:   'text-amber-500',
  };

  const label = isManual
    ? proposal.rawInput.replace('manual:', '').replace('-', ' ')
    : proposal.rawInput;

  const date = new Date(proposal.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-100/50 transition-colors group">
      {/* Status dot */}
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
        proposal.status === 'CONFIRMED' ? 'bg-emerald-500'
        : proposal.status === 'FAILED'  ? 'bg-red-500'
        : proposal.status === 'REJECTED' ? 'bg-zinc-400'
        : 'bg-amber-500'
      }`} />

      {/* Label */}
      <span className="flex-1 text-sm text-zinc-700 truncate">{label}</span>

      {/* Origin badge — subtle, not overwhelming */}
      <span className={`text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${
        isManual
          ? 'text-zinc-600 bg-zinc-100'
          : 'text-violet-700 bg-violet-100'
      }`}>
        {origin}
      </span>

      {/* Status */}
      <span className={`text-xs flex-shrink-0 font-medium ${statusStyle[proposal.status] ?? 'text-zinc-400'}`}>
        {proposal.status.toLowerCase()}
      </span>

      {/* Time */}
      <span className="text-xs text-zinc-400 flex-shrink-0 font-mono">{date}</span>

      {/* Tx hash link — only for confirmed */}
      {proposal.txHash && (
        <a
          href={`https://sepolia.basescan.org/tx/${proposal.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:text-blue-700 transition-colors font-mono flex-shrink-0 opacity-0 group-hover:opacity-100"
          title="View on BaseScan"
        >
          ↗
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supporting sub-components
// ---------------------------------------------------------------------------

function NativeBalanceCard({ address }: { address?: `0x${string}` }) {
  const { data: balance, isLoading } = useBalance({ address });

  return (
    <div className="col-span-1 border border-zinc-200/50 rounded-2xl bg-white/50 backdrop-blur-xl p-6 flex flex-col gap-4 justify-between shadow-sm">
      <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Total Balance</h3>
      {isLoading ? (
        <div className="h-10 w-32 bg-zinc-100 animate-pulse rounded-lg" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight text-zinc-900">
            {balance?.value != null
              ? parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4)
              : '0.00'}
          </span>
          <span className="text-lg text-zinc-500 font-medium">{balance?.symbol}</span>
        </div>
      )}
    </div>
  );
}

function AssetRow({ symbol, balance, price, value }: { symbol: string; balance: string; price: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-3 hover:bg-zinc-100/50 rounded-lg transition-colors border border-transparent hover:border-zinc-200/50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500 border border-zinc-200">
          {symbol[0]}
        </div>
        <div className="flex flex-col">
          <span className="font-medium text-zinc-800">{symbol}</span>
          <span className="text-xs text-zinc-500">{balance} {symbol}</span>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-medium text-zinc-800">{value}</span>
        <span className="text-xs text-zinc-500">{price}</span>
      </div>
    </div>
  );
}
