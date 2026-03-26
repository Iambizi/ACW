import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { proposalStore } from '@warden/core';
import { parseUnits } from 'viem';

// A mock 0x quote fetcher for the manual swap form (since we are not hooking up the api route yet, or we can use the core quote library directly!)
import { fetch0xQuote } from '@warden/core';

export function ManualSwapForm({ userAddress }: { userAddress?: `0x${string}` }) {
  const [fromToken, setFromToken] = useState('ETH');
  const [toToken, setToToken] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [isQuoting, setIsQuoting] = useState(false);

  const handlePropose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !userAddress || isQuoting) return;

    setIsQuoting(true);
    try {
      // Very crude mockup mapping to testnet tokens for the manual UI demo
      const parsedAmount = parseUnits(amount, 18);
      const parsedIntent = {
        type: 'swap' as const,
        fromToken,
        toToken,
        fromAmount: parsedAmount,
        rawConfidence: 1,
        ambiguities: []
      };

      // In real implementation, we would hit `/api/quote/route.ts` as per the spec.
      // But until the console orchestrator is built, we'll construct the mock natively to unblock Stage 1.
      const txPath = [{
          description: `Swap ${amount} ${fromToken} to ${toToken}`,
          to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' as `0x${string}`, // 0x Proxy
          value: parsedAmount,
          data: '0x00000000000000' as `0x${string}`, // Mock calldata
          chainId: 84532
      }];

      proposalStore.getState().addProposal({
        id: uuidv4(),
        createdAt: Date.now(),
        status: 'PENDING_APPROVAL',
        rawInput: `manual:swap ${amount} ${fromToken} → ${toToken}`,
        parsedIntent,
        txPath,
        estimatedGas: 150000n,
        deadline: Date.now() + 1000 * 60 * 5, // 5 min
        confidence: 1.0,
        riskLevel: 'low',
        warnings: [],
        toolTrace: [{
          toolName: 'manual-ui-quote',
          input: { fromToken, toToken, amount },
          output: { success: true },
          timestamp: Date.now(),
          durationMs: 500
        }]
      });
      
      setAmount('');
    } catch (err) {
      console.error("Swap quote failed", err);
    } finally {
      setIsQuoting(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto border border-zinc-800/50 rounded-2xl bg-zinc-900/20 backdrop-blur-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-xl font-medium tracking-tight mb-6">Swap Assets</h2>
      <form onSubmit={handlePropose} className="flex flex-col gap-4">
        
        <div className="flex flex-col gap-2 p-4 border border-zinc-800/50 rounded-xl bg-zinc-900/50">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Pay</label>
          <div className="flex justify-between items-center">
            <input 
              type="text" 
              placeholder="0.0" 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-transparent text-3xl font-light text-zinc-100 outline-none w-full placeholder:text-zinc-700"
            />
            <select value={fromToken} onChange={(e) => setFromToken(e.target.value)} className="bg-zinc-800 text-zinc-100 p-2 rounded-lg outline-none cursor-pointer border-r-8 border-transparent">
              <option value="ETH">ETH</option>
              <option value="USDC">USDC</option>
            </select>
          </div>
        </div>

        <div className="flex justify-center -my-3 z-10">
           <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-full cursor-pointer hover:bg-zinc-800 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
           </div>
        </div>

        <div className="flex flex-col gap-2 p-4 border border-zinc-800/50 rounded-xl bg-zinc-900/50">
          <label className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Receive</label>
          <div className="flex justify-between items-center">
             <div className="text-3xl font-light text-zinc-600">0.0</div>
            <select value={toToken} onChange={(e) => setToToken(e.target.value)} className="bg-zinc-800 text-zinc-100 p-2 rounded-lg outline-none cursor-pointer border-r-8 border-transparent">
              <option value="USDC">USDC</option>
              <option value="ETH">ETH</option>
            </select>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={!amount || isQuoting}
          className="mt-4 bg-zinc-100 text-zinc-900 hover:bg-white font-medium p-3 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isQuoting ? 'Fetching Quote...' : 'Review Swap'}
        </button>
      </form>
    </div>
  );
}
