'use client';

import React from 'react';
import { useStore } from 'zustand';
import { proposalStore } from '@warden/core';
import type { ProposalObject } from '@warden/core';
import { CONFIDENCE_THRESHOLDS } from '@warden/core';
import { useExecuteProposal } from '../hooks/useExecuteProposal';

// depute UI primitives — acquired into packages/ui/src/oversight/
import { ApprovalGate } from '@warden/ui/src/oversight/ApprovalGate';
import { PlanCard } from '@warden/ui/src/oversight/PlanCard';
import { ArtifactCard } from '@warden/ui/src/oversight/ArtifactCard';
import { ConfidenceMeter } from '@warden/ui/src/oversight/ConfidenceMeter';
import { RunControls } from '@warden/ui/src/oversight/RunControls';
import { ToolTrace } from '@warden/ui/src/oversight/ToolTrace';

// Terminal states that move to history
const TERMINAL_STATUSES = ['CONFIRMED', 'REJECTED', 'FAILED', 'HANDOFF_EXPIRED', 'EXPIRED'] as const;

export function ApprovalManager() {
  const proposals = useStore(proposalStore, (state: any) => state.proposals);
  const proposalList = Object.values(proposals) as ProposalObject[];

  // Split into active (occupies the gate panel) vs terminal (moves to history trace)
  const activeProposals = proposalList.filter((p) => !TERMINAL_STATUSES.includes(p.status as any));
  const activeProposal = activeProposals[activeProposals.length - 1];

  // Last confirmed — show artifact receipt below the input
  const lastCompleted = [...proposalList]
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((p) => p.status === 'CONFIRMED');

  if (!activeProposal) {
    if (!lastCompleted) return null;
    return (
      <div className="w-full animate-in fade-in slide-in-from-bottom-4">
        <ArtifactCard
          artifact={{
            id: lastCompleted.id,
            title: lastCompleted.rawInput || 'Transaction Confirmed',
            content: lastCompleted.txHash
              ? `Successfully broadcast on Base Sepolia.\nTx Hash: ${lastCompleted.txHash}`
              : 'Successfully confirmed on Base Sepolia.',
            type: 'other',
            timestamp: new Date(lastCompleted.createdAt).toISOString(),
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
      <ProposalRenderer proposal={activeProposal} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProposalRenderer — routes to the correct depute primitive per state
// ---------------------------------------------------------------------------

function ProposalRenderer({ proposal }: { proposal: ProposalObject }) {
  // Fire the real sendTransaction when this proposal enters EXECUTING state.
  // This is the only place sendTransaction is called — wagmi hooks require React context.
  useExecuteProposal(proposal);

  // DRAFT — intent is resolved but quote not yet fetched → show PlanCard skeleton
  if (proposal.status === 'DRAFT') {
    if (proposal.parsedIntent) {
      return (
        <PlanCard
          title="Generated Action Plan"
          steps={proposal.txPath.map((tx, idx) => ({
            id: String(idx),
            label: `Step ${idx + 1}`,
            description: tx.description,
            status: 'pending',
          }))}
          reasoning={`Evaluating your request to "${proposal.parsedIntent.type}". Preparing transaction routing…`}
          isStreaming={proposal.txPath.length === 0}
        />
      );
    }

    // Intent not yet parsed — show loading state
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
        <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-zinc-200 rounded-full mb-4" />
        <span className="text-zinc-400 font-medium text-sm">Evaluating intent…</span>
      </div>
    );
  }

  // PENDING_APPROVAL — gate fires, oversight layer is active
  if (proposal.status === 'PENDING_APPROVAL') {
    // Derive confidence 0–100 from 0–1 stored value
    const confidenceScore = proposal.confidence * 100;
    // Auto-expand ToolTrace for high-risk proposals — no toggle required
    const isHighRisk = proposal.riskLevel === 'high';
    // Compute visual warning level from governance thresholds
    const isBlockedConf = confidenceScore < CONFIDENCE_THRESHOLDS.BLOCK_EXECUTION * 100;

    return (
      <div className="flex flex-col gap-4">
        {/* Confidence feedback — warn before the gate so the user reads it first */}
        {isBlockedConf && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-950/40 border border-red-800/50 text-red-300 text-sm">
            <span className="font-mono text-xs bg-red-900/60 px-2 py-0.5 rounded">LOW CONFIDENCE</span>
            <span>Confidence below execution threshold — review the plan carefully before approving.</span>
          </div>
        )}

        {/* Primary gate */}
        <ApprovalGate
          title={proposal.rawInput || 'Review Proposed Transaction'}
          description={proposal.txPath.map((tx) => tx.description).join(' → ')}
          status="pending"
          confidence={confidenceScore}
          agentReasoning={`Risk level: ${proposal.riskLevel.toUpperCase()}. ` + (proposal.warnings.length > 0 ? `Warnings: ${proposal.warnings.join('; ')}.` : 'No warnings.')}
          onApprove={() => proposalStore.getState().approveProposal(proposal.id)}
          onReject={() => proposalStore.getState().rejectProposal(proposal.id)}
        />

        {/* Confidence meter and ToolTrace side panel */}
        <div className="grid grid-cols-2 gap-4">
          <ConfidenceMeter value={confidenceScore} />

          {proposal.toolTrace && proposal.toolTrace.length > 0 && (
            <div className="col-span-2">
              <ToolTrace
                calls={proposal.toolTrace.map((t, idx) => ({
                  id: String(idx),
                  name: t.toolName,
                  input: t.input,
                  output: t.output,
                  duration: t.durationMs,
                  status: 'completed',
                  timestamp: new Date(t.timestamp).toISOString(),
                }))}
                // Progressive disclosure: collapsed by default, expanded when riskLevel is 'high'
                defaultExpandedAll={isHighRisk}
                expandable
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // HANDOFF_PENDING — async approval is outstanding (remote signer, email link, etc.)
  if (proposal.status === 'HANDOFF_PENDING') {
    return (
      <div className="flex items-center justify-between px-6 py-4 bg-zinc-900 border border-amber-800/40 rounded-xl text-zinc-300">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-medium text-amber-400 text-sm">Awaiting remote approval…</span>
        </div>
        <span className="text-xs font-mono text-zinc-600">ID {proposal.id.slice(0, 8)}</span>
      </div>
    );
  }

  // EXECUTING — highest-stakes state per spec. Show RunControls immediately.
  // Show tx hash as soon as it's available. FAILED state must show decoded reason.
  if (proposal.status === 'EXECUTING') {
    return (
      <div className="flex flex-col gap-3">
        <RunControls
          state="running"
          showLabel
          onStop={() => proposalStore.getState().failProposal(proposal.id, 'User manually halted execution')}
        />
        {proposal.txHash && (
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs font-mono">
            <span className="text-zinc-500">tx</span>
            <a
              href={`https://sepolia.basescan.org/tx/${proposal.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 hover:text-white transition-colors truncate"
            >
              {proposal.txHash}
            </a>
          </div>
        )}
      </div>
    );
  }

  // FAILED — terminal with decoded revert reason (not raw error string)
  if (proposal.status === 'FAILED') {
    const reason = proposal.failureReason ?? 'Transaction failed. No revert reason available.';
    return (
      <div className="flex flex-col gap-3 p-5 bg-red-950/30 border border-red-800/40 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="text-red-400 font-semibold text-sm">Transaction Failed</span>
        </div>
        <p className="text-xs text-red-300/80 font-mono leading-relaxed">{reason}</p>
        <div className="flex gap-2 pt-1">
          <RunControls
            state="failed"
            onRetry={() => {
              // Re-add the proposal in PENDING_APPROVAL — strictly no new states
              proposalStore.getState().addProposal({
                ...proposal,
                id: proposal.id + '-retry',
                createdAt: Date.now(),
                status: 'PENDING_APPROVAL',
                failureReason: undefined,
              });
            }}
          />
        </div>
      </div>
    );
  }

  return null;
}
