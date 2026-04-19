import { createStore } from 'zustand/vanilla';
import { persist } from 'zustand/middleware';
import type { ProposalObject } from '../types';

export interface ProposalState {
  proposals: Record<string, ProposalObject>;

  // Actions
  addProposal: (proposal: ProposalObject) => void;
  approveProposal: (id: string) => void;
  rejectProposal: (id: string) => void;
  failProposal: (id: string, reason: string) => void;
  confirmProposal: (id: string, txHash: `0x${string}`) => void;
  expireProposal: (id: string) => void;
  /**
   * Records the EIP-5792 bundle ID after useSendCalls resolves.
   * The bundle ID is separate from the final txHash — polling useCallsStatus
   * will eventually resolve it to a real on-chain transaction hash.
   */
  setBundleId: (id: string, bundleId: string) => void;
  /** Updates the current step index during multi-step execution. */
  setCurrentStep: (id: string, stepIndex: number) => void;
}

/**
 * A discrete vanilla Zustand store for Proposal metadata.
 * Wrapped in persist middleware to survive page refreshes.
 */
export const proposalStore = createStore<ProposalState>()(
  persist(
    (set, get) => ({
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
      if (!p || p.status !== 'EXECUTING') return state;

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
      if (!p || p.status !== 'EXECUTING') return state;

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

  setBundleId: (id, bundleId) => {
    set((state) => {
      const p = state.proposals[id];
      if (!p) return state;
      return {
        proposals: {
          ...state.proposals,
          [id]: { ...p, bundleId },
        },
      };
    });
  },

  setCurrentStep: (id, stepIndex) => {
    set((state) => {
      const p = state.proposals[id];
      if (!p) return state;
      return {
        proposals: {
          ...state.proposals,
          [id]: { ...p, currentStepIndex: stepIndex },
        },
      };
    });
  },
}), {
  name: 'warden-proposals-storage',
}));
