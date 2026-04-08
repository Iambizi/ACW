'use client';

import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { parseEther, parseGwei } from 'viem';
import { usePublicClient } from 'wagmi';
import { proposalStore } from '@warden/core';

export function ManualSendForm({ userAddress }: { userAddress?: `0x${string}` }) {
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [estimatedGas, setEstimatedGas] = useState<bigint>(21000n);
  const [gasPrice, setGasPrice] = useState<bigint>(parseGwei('1')); // fallback 1 gwei
  const [isEstimating, setIsEstimating] = useState(false);

  const publicClient = usePublicClient();

  // Re-estimate gas whenever the user changes the recipient or amount
  useEffect(() => {
    if (!toAddress || !amount || !userAddress || !publicClient) return;

    let cancelled = false;
    setIsEstimating(true);

    const estimate = async () => {
      try {
        const parsedAmount = parseEther(amount);

        const [gasLimit, feeData] = await Promise.all([
          publicClient.estimateGas({
            account: userAddress,
            to: toAddress as `0x${string}`,
            value: parsedAmount,
          }),
          publicClient.estimateFeesPerGas(),
        ]);

        if (!cancelled) {
          setEstimatedGas(gasLimit);
          // Use maxFeePerGas as the cost basis; fall back to baseFeePerGas or 1 gwei
          setGasPrice(feeData.maxFeePerGas ?? feeData.gasPrice ?? parseGwei('1'));
        }
      } catch {
        // Network error or invalid address — silently keep the last estimate
      } finally {
        if (!cancelled) setIsEstimating(false);
      }
    };

    // Debounce by 600ms so we don't spam RPC on every keystroke
    const timer = setTimeout(estimate, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [toAddress, amount, userAddress, publicClient]);

  const gasCostEth = estimatedGas && gasPrice
    ? Number((estimatedGas * gasPrice) / 10n ** 18n)
    : null;

  const handlePropose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toAddress || !amount || !userAddress) return;

    try {
      const parsedAmount = parseEther(amount);

      proposalStore.getState().addProposal({
        id: uuidv4(),
        createdAt: Date.now(),
        status: 'PENDING_APPROVAL',
        rawInput: `manual:send ${amount} ETH → ${toAddress}`,
        parsedIntent: {
          type: 'transfer',
          toAddress: toAddress as `0x${string}`,
          amount: parsedAmount,
          token: 'ETH',
          rawConfidence: 1,
          ambiguities: [],
        },
        txPath: [{
          description: `Transfer ${amount} ETH`,
          to: toAddress as `0x${string}`,
          value: parsedAmount,
          data: '0x',
          chainId: 84532, // Base Sepolia
        }],
        estimatedGas,
        deadline: Date.now() + 1000 * 60 * 10, // 10 min
        confidence: 1.0,
        riskLevel: 'low',
        warnings: [],
        toolTrace: [],
      });

      setToAddress('');
      setAmount('');
    } catch (err) {
      console.error('Invalid input format', err);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto border border-zinc-200/50 rounded-2xl bg-white/60 backdrop-blur-xl p-5 sm:p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-lg sm:text-xl font-medium tracking-tight mb-5 text-zinc-900">Send ETH</h2>
      <form onSubmit={handlePropose} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-600">Recipient Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-zinc-900 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition-all placeholder:text-zinc-400"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-600">Amount (ETH)</label>
          <input
            type="text"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-zinc-900 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition-all placeholder:text-zinc-400"
          />
        </div>

        {/* Live Gas Estimate */}
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-100 text-xs text-zinc-500">
          <span className="font-medium">Estimated gas</span>
          {isEstimating ? (
            <span className="animate-pulse text-zinc-400">Estimating…</span>
          ) : gasCostEth !== null ? (
            <span className="font-mono text-zinc-700">
              ~{gasCostEth.toFixed(8)} ETH ({estimatedGas.toLocaleString()} gas units)
            </span>
          ) : (
            <span className="text-zinc-400 font-mono">Enter amount to estimate</span>
          )}
        </div>

        <button
          type="submit"
          disabled={!toAddress || !amount}
          className="mt-2 bg-zinc-900 text-white hover:bg-zinc-700 font-medium px-4 py-3 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
        >
          Review Transaction
        </button>
      </form>
    </div>
  );
}
