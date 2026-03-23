import { describe, it, expect, vi, beforeEach } from 'vitest';
import { constructProposal } from '../lib/orchestrator';
import { proposalStore } from '../store';

// Mock viem public client to simulate a successful chain transaction without hitting an external node
vi.mock('../lib/chain/client', () => ({
  publicClient: {
    call: vi.fn().mockResolvedValue({ data: '0x' }),
    estimateGas: vi.fn().mockResolvedValue(21000n),
  }
}));

// Provide fake API keys to surpass orchestrator validation
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-123';
process.env.ZERO_EX_API_KEY = 'sk-0x-test-123';

describe('Integration: E2E Proposal Pipeline', () => {
  beforeEach(() => {
    // Reset Zustand store state before each test
    proposalStore.setState({ proposals: {} });
    vi.restoreAllMocks();
  });

  it('cascades a valid swap intent into PENDING_APPROVAL state', async () => {
    // 1. Mock Anthropic Intent Response (Valid JSON struct matching ParsedIntent)
    const mockIntentResponse = {
      content: [{
        text: JSON.stringify({
          type: 'swap',
          fromToken: 'ETH',
          toToken: 'USDC',
          fromAmount: '1000000000000000000',
          rawConfidence: 0.95,
          ambiguities: []
        })
      }]
    };

    // 2. Mock 0x Quote Response
    const mock0xResponse = {
      to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
      value: '1000000000000000000',
      data: '0xabcdef',
      estimatedGas: '150000'
    };

    // 3. Intercept global fetch to isolate the system
    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlString = url.toString();
      if (urlString.includes('api.anthropic.com')) {
        return { ok: true, json: async () => mockIntentResponse };
      }
      if (urlString.includes('api.0x.org')) {
        return { ok: true, json: async () => mock0xResponse };
      }
      throw new Error(`Unmocked fetch call to ${urlString}`);
    });

    const userAddress = '0x1234567890123456789012345678901234567890' as `0x${string}`;
    const result = await constructProposal('Swap 1 ETH for USDC', userAddress);

    // Assert orchestration completed successfully
    expect(result.simulationError).toBeUndefined();
    expect(result.proposal).toBeDefined();

    // Assert Store state updated correctly
    const state = proposalStore.getState().proposals[result.proposal.id];
    expect(state).toBeDefined();
    
    // Assert cascaded values strictly map to the IMDA L3 contract
    expect(state.status).toBe('PENDING_APPROVAL');
    expect(state.parsedIntent.type).toBe('swap');
    
    // Validate BigInt hydration occurred safely
    if (state.parsedIntent.type === 'swap') {
      expect(state.parsedIntent.fromAmount).toBe(1000000000000000000n);
    }
    
    // Validate 0x step mapping
    expect(state.txPath.length).toBe(1);
    expect(state.txPath[0].to).toBe('0xdef1c0ded9bec7f1a1670819833240f027b25eff');
    expect(state.txPath[0].data).toBe('0xabcdef');
    
    // Validate target Risk Assessment (0.95 confidence > 0.70 threshold = low risk)
    expect(state.riskLevel).toBe('low');
    
    // Validate Auditability (ToolTrace must contain the Claude parser performance)
    expect(state.toolTrace.length).toBe(1);
    expect(state.toolTrace[0].toolName).toBe('claude_parser');
  });

  it('bumps risk to HIGH on poor confidence and adds warnings', async () => {
    // 1. Mock Low Confidence Intent
    const mockIntentResponse = {
      content: [{
        text: JSON.stringify({
          type: 'swap',
          fromToken: 'ETH',
          toToken: 'UNKNOWN',
          fromAmount: '10',
          rawConfidence: 0.35, // Below BLOCK_EXECUTION (0.50)
          ambiguities: ["Could not determine destination token"]
        })
      }]
    };

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlString = url.toString();
      if (urlString.includes('api.anthropic.com')) {
        return { ok: true, json: async () => mockIntentResponse };
      }
      // Stub 0x locally
      return { ok: true, json: async () => ({ to: '0x0', value: '0', data: '0x', estimatedGas: '0' }) };
    });

    const userAddress = '0x1234567890123456789012345678901234567890' as `0x${string}`;
    await constructProposal('Swap some eth for unknown', userAddress);

    const proposals = Object.values(proposalStore.getState().proposals);
    const p = proposals[0] as unknown as any;

    // Assert Risk Assessor accurately classified it based strictly on the config constants
    expect(p.riskLevel).toBe('high');
    expect(p.warnings.length).toBeGreaterThan(0);
    expect(p.warnings[0]).toContain('critically low'); // matches evaluateRisk messaging
  });
});
