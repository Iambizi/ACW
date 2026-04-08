'use client';

import { useEffect } from 'react';
import { useStore } from 'zustand';
import { proposalStore } from '@warden/core';
import type { ProposalObject } from '@warden/core';

const ACTIVE_STATUSES = ['PENDING_APPROVAL', 'HANDOFF_PENDING'] as const;
const CHECK_INTERVAL_MS = 5_000; // check every 5 seconds

/**
 * useProposalDeadlines
 *
 * Background hook that monitors the Zustand store and automatically
 * expires any proposal whose deadline has passed.
 *
 * Mount this once at the top of ApprovalManager — it is idempotent
 * and safe to run even when there are no active proposals.
 *
 * RATIONALE: AI-generated proposals embed slippage, price quotes, and
 * liquidity assumptions at creation time. Letting a PENDING_APPROVAL
 * proposal sit indefinitely means the user could approve stale data,
 * resulting in a worse execution price or a reverted transaction.
 */
export function useProposalDeadlines() {
  const proposals = useStore(proposalStore, (s: any) => s.proposals);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const all = Object.values(proposals) as ProposalObject[];

      all.forEach((p) => {
        if (!ACTIVE_STATUSES.includes(p.status as any)) return;
        if (p.deadline && now > p.deadline) {
          proposalStore.getState().expireProposal(p.id);
        }
      });
    };

    // Run immediately on mount in case we rehydrated an already-expired proposal
    tick();

    const intervalId = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  // Re-run when the proposals map identity changes (new proposal added/updated)
  }, [proposals]);
}
