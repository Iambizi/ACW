'use client';

/**
 * useExecuteProposal — fires a real on-chain transaction when a ProposalObject
 * transitions to EXECUTING status.
 *
 * This hook MUST live in the React layer. wagmi hooks cannot be called from
 * the vanilla Zustand store in packages/core — they require a React context.
 *
 * Lifecycle:
 * 1. approveProposal() → store sets status = 'EXECUTING'
 * 2. This hook detects status === 'EXECUTING' with no txHash yet
 * 3. Calls wagmi sendTransaction with the first TxStep from proposal.txPath
 * 4. On success: calls confirmProposal(id, txHash) → status = 'CONFIRMED'
 * 5. On failure: calls failProposal(id, decodedReason) → status = 'FAILED'
 *
 * Multi-step transactions (Phase 3): txPath may contain more than one TxStep.
 * The current implementation executes txPath[0] only. Phase 3 will chain steps.
 */

import { useEffect, useRef } from 'react';
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { proposalStore } from '@warden/core';
import type { ProposalObject } from '@warden/core';

export function useExecuteProposal(proposal: ProposalObject | undefined) {
  const { sendTransactionAsync } = useSendTransaction();
  const executingRef = useRef<string | null>(null); // tracks in-flight proposal id

  useEffect(() => {
    if (!proposal) return;
    if (proposal.status !== 'EXECUTING') return;
    if (proposal.txHash) return; // already broadcast — don't double-send
    if (executingRef.current === proposal.id) return; // already in flight

    if (!proposal.txPath || proposal.txPath.length === 0) {
      proposalStore.getState().failProposal(
        proposal.id,
        'No transaction steps found in proposal — cannot broadcast.'
      );
      return;
    }

    executingRef.current = proposal.id;

    const step = proposal.txPath[0]; // Phase 3: chain multiple steps

    sendTransactionAsync({
      to: step.to,
      value: step.value,
      data: step.data,
      chainId: step.chainId,
    })
      .then((hash) => {
        // Stamp the tx hash so RunControls shows the BaseScan link immediately
        proposalStore.getState().confirmProposal(proposal.id, hash);
      })
      .catch((err: Error) => {
        // Decode revert reason from the error message — wallets surface the reason
        // in the message string. Strip the RPC noise if present.
        const raw = err.message ?? 'Transaction reverted with no reason.';
        const decoded = decodeRevertReason(raw);
        proposalStore.getState().failProposal(proposal.id, decoded);
        executingRef.current = null; // allow retry
      });
  }, [proposal?.id, proposal?.status, proposal?.txHash, sendTransactionAsync]);
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
