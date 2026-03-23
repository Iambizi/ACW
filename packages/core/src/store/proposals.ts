import { createStore } from 'zustand/vanilla';
import type { ProposalObject } from '../types';

export interface ProposalState {
  proposals: Record<string, ProposalObject>;

  // Actions
  addProposal: (proposal: ProposalObject) => void;
  approveProposal: (id: string) => void;
  autoApproveProposal: (id: string, reason: string) => void;
  rejectProposal: (id: string) => void;
  failProposal: (id: string, reason: string) => void;
  confirmProposal: (id: string, txHash: `0x${string}`) => void;
  expireProposal: (id: string) => void;
}

/**
 * A discrete vanilla Zustand store for Proposal metadata.
 * Use bounded vanilla stores in core so UI frameworks can subscribe 
 * to them using useSyncExternalStore or React-specific bindings gracefully.
 */
export const proposalStore = createStore<ProposalState>()((set, get) => ({
  proposals: {},

  addProposal: (proposal) => {
    set((state) => ({
      proposals: { ...state.proposals, [proposal.id]: proposal },
    }));
  },

  approveProposal: (id) => {
    set((state) => {
      const p = state.proposals[id];
      if (!p || p.status !== 'PENDING_APPROVAL') return state;

      return {
        proposals: {
          ...state.proposals,
          [id]: { ...p, status: 'EXECUTING', approvedAt: Date.now() },
        },
      };
    });
  },

  autoApproveProposal: (id, reason) => {
    set((state) => {
      const p = state.proposals[id];
      // Only valid to jump from DRAFT or PENDING_APPROVAL into AUTO_APPROVED state
      if (!p || (p.status !== 'DRAFT' && p.status !== 'PENDING_APPROVAL')) return state;

      return {
        proposals: {
          ...state.proposals,
          [id]: { 
            ...p, 
            status: 'AUTO_APPROVED', 
            approvedAt: Date.now(),
            autoApprovalReason: reason
          },
        },
      };
    });
  },

  rejectProposal: (id) => {
    set((state) => {
      const p = state.proposals[id];
      if (!p || p.status !== 'PENDING_APPROVAL') return state;

      return {
        proposals: {
          ...state.proposals,
          [id]: { ...p, status: 'REJECTED', rejectedAt: Date.now() },
        },
      };
    });
  },

  failProposal: (id, reason) => {
    set((state) => {
      const p = state.proposals[id];
      // Note: both EXECUTING and AUTO_APPROVED can fail during on-chain execution
      if (!p || (p.status !== 'EXECUTING' && p.status !== 'AUTO_APPROVED')) return state;

      return {
        proposals: {
          ...state.proposals,
          [id]: { ...p, status: 'FAILED', failureReason: reason },
        },
      };
    });
  },

  confirmProposal: (id, txHash) => {
    set((state) => {
      const p = state.proposals[id];
      if (!p || (p.status !== 'EXECUTING' && p.status !== 'AUTO_APPROVED')) return state;

      return {
        proposals: {
          ...state.proposals,
          [id]: { ...p, status: 'CONFIRMED', txHash },
        },
      };
    });
  },

  expireProposal: (id) => {
    set((state) => {
      const p = state.proposals[id];
      // A proposal shouldn't magically expire if it's already executing or finished.
      if (!p || p.status === 'EXECUTING' || p.status === 'CONFIRMED' || p.status === 'FAILED' || p.status === 'REJECTED') {
        return state;
      }

      return {
        proposals: {
          ...state.proposals,
          [id]: { ...p, status: 'EXPIRED' },
        },
      };
    });
  },
}));
