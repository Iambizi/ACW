/**
 * Gemini Research Agent — satisfies the ResearchAgent interface.
 *
 * Model: gemini-2.0-flash
 * NOTE: The brief specifies "gemini-3-flash" as the target. As of March 2026,
 * the public Gemini API stable identifier is "gemini-2.0-flash". Update this
 * string when Gemini 3 Flash becomes generally available. The interface contract
 * and agentic loop are model-agnostic — swap the model string only.
 *
 * Gemini API differences from Anthropic (critical — do not mix these up):
 * 1. Request body uses `contents` array, not `messages`
 * 2. Tool calls are in candidates[0].content.parts as { functionCall: { name, args } }
 * 3. Tool results are fed back as parts with { functionResponse: { name, response } }
 *    inside a new `contents` entry with role: 'user'
 * 4. thinking_budget controls reasoning depth (mapped from ThinkingLevel)
 * 5. Tools are passed as { functionDeclarations: [...] } inside a `tools` array
 *
 * @see https://ai.google.dev/gemini-api/docs/function-calling
 */

import { RESEARCH_SYSTEM_PROMPT } from './prompts';
import { RESEARCH_TOOLS } from './tools';
import type { ResearchAgent, ResearchResult, ThinkingLevel } from './types';
import type { ToolTraceEntry } from '../../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GEMINI_MODEL = 'gemini-2.0-flash'; // Update to gemini-3-flash when GA
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Maps ThinkingLevel to Gemini thinking_budget token counts */
const THINKING_BUDGET: Record<ThinkingLevel, number> = {
  minimal: 0,
  low: 512,
  medium: 2048,
  high: 8192,
};

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

async function executeGetTokenPrice(args: { token: string }): Promise<unknown> {
  // CoinGecko free tier — no API key required for this endpoint
  const id = args.token.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
    const data = await res.json();

    if (!data[id]) {
      // CoinGecko uses IDs like 'ethereum' not symbols — try a symbol search as fallback
      const searchRes = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(args.token)}`
      );
      const searchData = await searchRes.json();
      const match = searchData?.coins?.[0];
      if (match) {
        return { note: `Token found as "${match.id}" — retry with this ID for pricing`, id: match.id };
      }
      return { error: `No pricing data found for "${args.token}"` };
    }

    return data[id];
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function executeGetLiquidityDepth(args: {
  fromToken: string;
  toToken: string;
  amount?: string;
}): Promise<unknown> {
  const apiKey = process.env.ZERO_EX_API_KEY;
  if (!apiKey) return { error: 'ZERO_EX_API_KEY not set — cannot fetch liquidity depth' };

  // Well-known Base Sepolia token addresses for symbol resolution
  const TOKEN_MAP: Record<string, string> = {
    ETH:  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    WETH: '0x4200000000000000000000000000000000000006',
  };

  const sellToken = TOKEN_MAP[args.fromToken.toUpperCase()] ?? args.fromToken;
  const buyToken  = TOKEN_MAP[args.toToken.toUpperCase()] ?? args.toToken;
  const sellAmount = args.amount ? String(Math.floor(parseFloat(args.amount) * 1e18)) : '1000000000000000000'; // 1 unit

  const url = new URL('https://api.0x.org/swap/v1/price');
  url.searchParams.set('sellToken', sellToken);
  url.searchParams.set('buyToken', buyToken);
  url.searchParams.set('sellAmount', sellAmount);
  url.searchParams.set('chainId', '8453'); // Base Mainnet

  try {
    const res = await fetch(url.toString(), {
      headers: { '0x-api-key': apiKey, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`0x API returned ${res.status}`);
    const data = await res.json();
    return {
      price: data.price,
      estimatedPriceImpact: data.estimatedPriceImpact,
      sources: data.sources?.filter((s: any) => parseFloat(s.proportion) > 0),
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function executeWebSearch(args: { query: string }): Promise<unknown> {
  // TODO: Gemini 3 Flash has native Google Search grounding for unstructured queries.
  // When the model is upgraded to gemini-3-flash, unstructured market queries can use
  // the grounding config in the Gemini API request directly.
  // For now, return a structured placeholder and rely on Gemini's built-in grounding.
  return {
    note: 'Web search delegated to Gemini native Google Search grounding.',
    query: args.query,
  };
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

async function dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_token_price':
      return executeGetTokenPrice(args as { token: string });
    case 'get_liquidity_depth':
      return executeGetLiquidityDepth(args as { fromToken: string; toToken: string; amount?: string });
    case 'web_search':
      return executeWebSearch(args as { query: string });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Gemini Research Agent
// ---------------------------------------------------------------------------

export const geminiResearchAgent: ResearchAgent = {
  async research(input: string, thinkingLevel: ThinkingLevel = 'low'): Promise<ResearchResult> {
    const startTime = Date.now();
    const apiKey = process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY is not set — Gemini research agent cannot run');
    }

    const toolTrace: ToolTraceEntry[] = [];

    // Initial Gemini request — contents array (not messages)
    // System instruction is separate from the contents array in Gemini's API
    const contents: unknown[] = [
      { role: 'user', parts: [{ text: input }] },
    ];

    let finalSummary = '';
    let iterations = 0;
    const MAX_ITERATIONS = 6; // Safety cap on agentic loop

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const requestBody = {
        system_instruction: {
          parts: [{ text: RESEARCH_SYSTEM_PROMPT }],
        },
        contents,
        tools: [
          {
            function_declarations: RESEARCH_TOOLS,
            // Google Search grounding — active for web queries
            // When gemini-3-flash is available, this provides native real-time data
            google_search: {},
          },
        ],
        generation_config: {
          temperature: 0.3,
          ...(thinkingLevel !== 'minimal' && {
            thinking_config: {
              thinking_budget: THINKING_BUDGET[thinkingLevel],
            },
          }),
        },
      };

      const response = await fetch(
        `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const parts: any[] = candidate?.content?.parts ?? [];

      // Collect any tool calls from this response turn
      const toolCallParts = parts.filter((p: any) => p.functionCall);
      const textParts = parts.filter((p: any) => p.text);

      // If no tool calls — we have the final text response
      if (toolCallParts.length === 0) {
        finalSummary = textParts.map((p: any) => p.text).join('\n');
        break;
      }

      // Append the model's response to the contents history
      contents.push({ role: 'model', parts });

      // Execute each tool call and collect results
      const toolResultParts: unknown[] = [];

      for (const part of toolCallParts) {
        const { name, args } = part.functionCall;
        const toolStart = Date.now();

        const result = await dispatchTool(name, args ?? {});

        const durationMs = Date.now() - toolStart;

        // Track as ToolTraceEntry — same structure as the intent pipeline
        toolTrace.push({
          toolName: name,
          input: args ?? {},
          output: result as Record<string, unknown>,
          timestamp: toolStart,
          durationMs,
        });

        // Feed result back using Gemini's functionResponse format
        toolResultParts.push({
          functionResponse: {
            name,
            response: { result },
          },
        });
      }

      // Append tool results as a user turn — Gemini's agentic loop pattern
      contents.push({ role: 'user', parts: toolResultParts });
    }

    if (!finalSummary) {
      finalSummary = '_(Research agent reached iteration limit without a final response)_';
    }

    return {
      summary: finalSummary,
      toolTrace,
      query: input,
      timestamp: startTime,
      durationMs: Date.now() - startTime,
      thinkingLevel,
    };
  },
};
