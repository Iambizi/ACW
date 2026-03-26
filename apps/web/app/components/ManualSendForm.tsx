import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { parseEther } from 'viem';
import { proposalStore } from '@warden/core';

export function ManualSendForm({ userAddress }: { userAddress?: `0x${string}` }) {
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [baseFee, setBaseFee] = useState(21000n); // Rough hardcode for ETH transfer gas limit

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
          ambiguities: []
        },
        txPath: [{
          description: `Transfer ${amount} ETH`,
          to: toAddress as `0x${string}`,
          value: parsedAmount,
          data: '0x',
          chainId: 84532 // Base Sepolia
        }],
        estimatedGas: baseFee,
        deadline: Date.now() + 1000 * 60 * 10, // 10 min
        confidence: 1.0,
        riskLevel: 'low',
        warnings: [],
        toolTrace: [{
          toolName: 'manual-ui',
          input: { toAddress, amount },
          output: { success: true },
          timestamp: Date.now(),
          durationMs: 0
        }]
      });
      
      setToAddress('');
      setAmount('');
    } catch (err) {
      console.error("Invalid input format", err);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto border border-zinc-800/50 rounded-2xl bg-zinc-900/20 backdrop-blur-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-xl font-medium tracking-tight mb-6">Send ETH</h2>
      <form onSubmit={handlePropose} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm text-zinc-400">Recipient Address</label>
          <input 
            type="text" 
            placeholder="0x..." 
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 outline-none focus:border-zinc-600 transition-colors placeholder:text-zinc-700"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-zinc-400">Amount (ETH)</label>
          <input 
            type="text" 
            placeholder="0.0" 
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 outline-none focus:border-zinc-600 transition-colors placeholder:text-zinc-700"
          />
        </div>
        <button 
          type="submit" 
          disabled={!toAddress || !amount}
          className="mt-4 bg-zinc-100 text-zinc-900 hover:bg-white font-medium p-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Review Transaction
        </button>
      </form>
    </div>
  );
}
