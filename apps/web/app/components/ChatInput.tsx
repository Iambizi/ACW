'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { v4 as uuidv4 } from 'uuid';
import { proposalStore } from '@warden/core';
import type { ParsedIntent } from '@warden/core';

export function ChatInput() {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { address } = useAccount();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !address || isProcessing) return;

    setIsProcessing(true);
    const intentText = input;
    setInput('');

    // 1. Generate core deterministic ProposalObject ID
    const proposalId = uuidv4();

    try {
      // 2. Insert into store as DRAFT to trigger PlanCard immediately
      // The PlanCard component expects a proposal object with parsedIntent to render
      // But until parsedIntent arrives, we can show a loader if we only have rawInput
      proposalStore.getState().addProposal({
        id: proposalId,
        createdAt: Date.now(),
        status: 'DRAFT',
        rawInput: intentText,
        parsedIntent: null as unknown as ParsedIntent, // Temporary cast until API returns
        txPath: [],
        estimatedGas: 0n,
        deadline: 0,
        confidence: 0,
        riskLevel: 'low',
        warnings: [],
        toolTrace: []
      });

      // 3. Fetch Intent parsing
      const intentRes = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: intentText })
      });
      if (!intentRes.ok) throw new Error('Failed to parse intent');
      const parserResponse = await intentRes.json();

      // Ensure BigInt hydration if returning from JSON (native fetch strips bigints to strings)
      // Usually handled in core, but crossing HTTP boundary requires re-hydration in client
      const parsedIntent = {
         ...parserResponse.parsedIntent,
         // Safely hydrate amounts from string -> BigInt if they exist
         amount: parserResponse.parsedIntent.amount ? BigInt(parserResponse.parsedIntent.amount) : undefined,
         fromAmount: parserResponse.parsedIntent.fromAmount ? BigInt(parserResponse.parsedIntent.fromAmount) : undefined,
      } as ParsedIntent;

      // Update store with parsedIntent (Triggers PlanCard rendering)
      proposalStore.setState(state => {
         const p = state.proposals[proposalId];
         if (!p) return state;
         return {
            proposals: {
               ...state.proposals,
               [proposalId]: { 
                  ...p, 
                  parsedIntent,
                  warnings: [...p.warnings, ...(parserResponse.warnings || [])],
                  toolTrace: [...p.toolTrace, parserResponse.toolTraceEntry]
               }
            }
         };
      });

      // 4. Route by intent type
      if (parsedIntent.type === 'swap') {
         const quoteRes = await fetch('/api/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parsedIntent, userAddress: address })
         });
         
         if (!quoteRes.ok) throw new Error('Failed to fetch quote');
         const quoteData = await quoteRes.json();

         proposalStore.setState(state => {
            const p = state.proposals[proposalId];
            if (!p) return state;
            return {
               proposals: {
                  ...state.proposals,
                  [proposalId]: { 
                     ...p, 
                     txPath: quoteData.txPath || [],
                     estimatedGas: quoteData.estimatedGas ? BigInt(quoteData.estimatedGas) : p.estimatedGas,
                     status: 'PENDING_APPROVAL',
                     confidence: parsedIntent.rawConfidence || 0.8,
                     riskLevel: quoteData.riskLevel || p.riskLevel,
                     warnings: [...p.warnings, ...(quoteData.warnings || [])],
                  }
               }
            };
         });

      } else if (parsedIntent.type === 'transfer') {
         // Build the transfer TxStep via the new /api/transfer route (no 0x quote needed)
         const transferRes = await fetch('/api/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parsedIntent, userAddress: address })
         });

         if (!transferRes.ok) throw new Error('Failed to construct transfer');
         const transferData = await transferRes.json();

         // Re-hydrate BigInt for txPath.value fields (serialized as string over HTTP)
         const txPath = (transferData.txPath || []).map((step: any) => ({
            ...step,
            value: BigInt(step.value ?? '0'),
         }));

         proposalStore.setState(state => {
            const p = state.proposals[proposalId];
            if (!p) return state;
            return {
               proposals: {
                  ...state.proposals,
                  [proposalId]: {
                     ...p,
                     txPath,
                     estimatedGas: transferData.estimatedGas ? BigInt(transferData.estimatedGas) : p.estimatedGas,
                     status: 'PENDING_APPROVAL',
                     confidence: parsedIntent.rawConfidence || 0.85,
                     riskLevel: transferData.riskLevel || p.riskLevel,
                     warnings: [...p.warnings, ...(transferData.warnings || [])],
                  }
               }
            };
         });

      } else if (parsedIntent.type === 'stake') {
         // Stake intents are surfaced at the ApprovalGate with a protocol warning.
         // The txPath is empty — the user must confirm before we route to a protocol.
         // TODO v2: integrate Aave/Lido protocol adapters.
         proposalStore.setState(state => {
            const p = state.proposals[proposalId];
            if (!p) return state;
            return {
               proposals: {
                  ...state.proposals,
                  [proposalId]: {
                     ...p,
                     txPath: [],
                     status: 'PENDING_APPROVAL',
                     confidence: parsedIntent.rawConfidence || 0.6,
                     riskLevel: 'medium',
                     warnings: [
                        ...p.warnings,
                        `Staking via ${(parsedIntent as any).protocol || 'unknown protocol'} is not yet integrated. Approving will have no on-chain effect in v1.`,
                     ],
                  }
               }
            };
         });

      } else {
         // research / unknown — reject with a human-readable reason
         const reason = parsedIntent.type === 'research'
            ? 'Research queries are handled conversationally and do not produce transactions.'
            : `Intent type "${parsedIntent.type}" is not supported in this version.`;

         proposalStore.setState(state => {
            const p = state.proposals[proposalId];
            if (!p) return state;
            return {
               proposals: {
                  ...state.proposals,
                  [proposalId]: {
                     ...p,
                     status: 'REJECTED',
                     failureReason: reason,
                  }
               }
            };
         });
      }

    } catch (error) {
      console.error(error);
      proposalStore.getState().failProposal(proposalId, 'Execution pipeline failed or rejected');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-6 sticky bottom-6 z-50">
      <form 
        onSubmit={handleSubmit}
        className="w-full border border-zinc-800/80 rounded-2xl bg-zinc-900/60 backdrop-blur-2xl p-2 flex items-center shadow-2xl relative"
      >
        <div className="absolute -top-[1px] -inset-x-[1px] -bottom-[1px] bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent opacity-0 hover:opacity-100 rounded-2xl transition-opacity pointer-events-none" />
        <input 
          type="text" 
          placeholder={isProcessing ? "Agent is resolving intent..." : "E.g. Swap 100 USDC for ETH"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isProcessing || !address}
          className="flex-1 bg-transparent border-none outline-none text-zinc-100 placeholder:text-zinc-500 px-4 text-lg"
        />
        <button 
          type="submit" 
          disabled={!input.trim() || isProcessing || !address}
          className="bg-zinc-100 text-zinc-900 rounded-xl px-4 py-2 font-medium hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Thinking' : 'Send'}
        </button>
      </form>
    </div>
  );
}
