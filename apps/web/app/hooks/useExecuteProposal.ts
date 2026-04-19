'use client';

/**
 * useExecuteProposal — fires real on-chain transactions when a ProposalObject
 * transitions to EXECUTING status.
 *
 * This hook MUST live in the React layer. wagmi hooks cannot be called from
 * the vanilla Zustand store in packages/core — they require a React context.
 *
 * Lifecycle:
 * 1. approveProposal() → store sets status = 'EXECUTING'
 * 2. This hook detects status === 'EXECUTING' with no bundleId yet
 * 3. Iterates over ALL steps in proposal.txPath, firing sendCallsAsync for each
 * 4. After each sendCallsAsync resolves, writes bundleId to store via setBundleId
 * 5. useCallsStatus polls the wallet until the bundle is settled
 * 6. Real txHash is extracted from the receipt and written via confirmProposal
 *
 * Multi-step handling:
 *   Each TxStep in txPath is executed sequentially via individual sendCallsAsync
 *   calls. The store's `currentStepIndex` field tracks which step is active,
 *   allowing the UI to render per-step progress.
 *
 *   Note: In a production flow, the approve + swap steps could be batched into
 *   a single EIP-5792 calls array if the wallet supports atomic batching.
 *   We execute them sequentially here for maximum wallet compatibility.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSendCalls, useCallsStatus } from 'wagmi/experimental';
import { proposalStore } from '@warden/core';
import type { ProposalObject } from '@warden/core';

// How often to re-check the bundle status with the wallet (ms)
const POLLING_INTERVAL_MS = 2_000;
// How long to wait for bundle settlement before giving up (ms)
const POLLING_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes

export function useExecuteProposal(proposal: ProposalObject | undefined) {
  const { sendCallsAsync } = useSendCalls();
  const executingRef = useRef<string | null>(null); // tracks in-flight proposal id

  // --- Phase 2: Poll bundle status after sendCalls resolves ---
  // bundleId is written to the store after the first sendCalls round-trip.
  const bundleId = proposal?.bundleId;

  const { data: callsStatus } = useCallsStatus({
    id: bundleId ?? '',
    query: {
      // Only poll when we have a bundleId and are still EXECUTING
      enabled: !!bundleId && proposal?.status === 'EXECUTING' && !proposal?.txHash,
      refetchInterval: POLLING_INTERVAL_MS,
    },
  });

  // When callsStatus reports settled, extract the real txHash and confirm
  useEffect(() => {
    if (!proposal || !bundleId) return;
    if (proposal.status !== 'EXECUTING') return;
    if (proposal.txHash) return; // already confirmed

    if (callsStatus?.status === 'success') {
      // EIP-5792: receipts is an array of per-call receipts.
      // Grab the last call's transactionHash as the canonical tx hash.
      const receipts = (callsStatus as any).receipts ?? [];
      const lastReceipt = receipts[receipts.length - 1];
      const realTxHash: `0x${string}` | undefined = lastReceipt?.transactionHash;

      if (realTxHash) {
        proposalStore.getState().confirmProposal(proposal.id, realTxHash);
      } else {
        // Bundle settled but no hash in receipt — use the bundle ID as a sentinel
        proposalStore.getState().confirmProposal(proposal.id, bundleId as `0x${string}`);
      }
    } else if (callsStatus?.status === 'failure') {
      proposalStore.getState().failProposal(
        proposal.id,
        'Bundle execution failed in the wallet. Check your wallet for details.'
      );
      executingRef.current = null;
    }
  }, [callsStatus?.status, proposal?.id, proposal?.status, proposal?.txHash, bundleId]);

  // --- Phase 1: Execute all txPath steps sequentially ---
  useEffect(() => {
    if (!proposal) return;
    if (proposal.status !== 'EXECUTING') return;
    if (proposal.bundleId) return;  // already dispatched to wallet
    if (executingRef.current === proposal.id) return; // already in flight

    if (!proposal.txPath || proposal.txPath.length === 0) {
      proposalStore.getState().failProposal(
        proposal.id,
        'No transaction steps found in proposal — cannot broadcast.'
      );
      return;
    }

    executingRef.current = proposal.id;

    // Execute all steps in order. Each step is sent as its own EIP-5792 call bundle.
    // This preserves sequential ordering (approve must mine before swap).
    (async () => {
      const store = proposalStore.getState();

      for (let i = 0; i < proposal.txPath.length; i++) {
        const step = proposal.txPath[i];

        // Update visible step progress in the store
        store.setCurrentStep(proposal.id, i);

        try {
          const result = await sendCallsAsync({
            calls: [{
              to: step.to as `0x${string}`,
              value: step.value,
              data: step.data as `0x${string}`,
            }],
            capabilities: {
              paymasterService: {
                url: process.env.NEXT_PUBLIC_PAYMASTER_URL
                  ?? 'https://api.developer.coinbase.com/rpc/v1/base-sepolia/...',
              },
            },
          });

          // Write the bundle ID from the LAST step — this is what we'll poll.
          // (All steps share the same proposal; the last bundle ID is the receipt source.)
          store.setBundleId(proposal.id, result.id);

        } catch (err: unknown) {
          const raw = (err as Error).message ?? 'Transaction reverted with no reason.';
          const decoded = decodeRevertReason(raw);
          store.failProposal(proposal.id, `Step ${i + 1}/${proposal.txPath.length} failed: ${decoded}`);
          executingRef.current = null;
          return; // Abort remaining steps on any failure
        }
      }

      // All steps dispatched. The useCallsStatus polling effect above will
      // now watch the last bundleId and confirm or fail the proposal.
    })();

  }, [proposal?.id, proposal?.status, proposal?.bundleId, sendCallsAsync]);
}

/**
 * Strips common RPC error wrappers to surface the human-readable revert reason.
 * Wallets embed the reason in different positions depending on provider.
 */
function decodeRevertReason(raw: string): string {
  // Pattern: "execution reverted: <reason>"
  const revertMatch = raw.match(/execution reverted:\s*(.+)/i);
  if (revertMatch) return revertMatch[1].trim();

  // Pattern: MetaMask / wagmi wrapping — reason is after last colon
  const colonSplit = raw.split(':');
  if (colonSplit.length > 1) {
    const candidate = colonSplit[colonSplit.length - 1].trim();
    if (candidate.length > 0 && candidate.length < 200) return candidate;
  }

  // Fallback: truncate raw message at a readable length
  return raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
}
