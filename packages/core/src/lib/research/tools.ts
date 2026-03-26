/**
 * Tool definitions for the Gemini research agent.
 * Uses Gemini's function_declarations format — this differs from the
 * Anthropic tool schema. Do not mix these with Anthropic tool definitions.
 *
 * Three tools:
 * 1. get_token_price   — CoinGecko free tier
 * 2. get_liquidity_depth — 0x Protocol API
 * 3. web_search        — structured queries (Gemini native Search grounding
 *                        handles unstructured market queries in agent.ts)
 */

export const RESEARCH_TOOLS = [
  {
    name: 'get_token_price',
    description:
      'Get current price, 24h change, and market cap for a token by symbol or contract address on Base.',
    parameters: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description:
            'Token symbol (e.g. "ETH", "USDC") or contract address on Base.',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'get_liquidity_depth',
    description:
      'Get available liquidity for a token pair on Base via 0x Protocol API.',
    parameters: {
      type: 'object',
      properties: {
        fromToken: {
          type: 'string',
          description: 'Source token symbol or address.',
        },
        toToken: {
          type: 'string',
          description: 'Destination token symbol or address.',
        },
        amount: {
          type: 'string',
          description:
            'Optional amount in human units (e.g. "1.5") to estimate price impact.',
        },
      },
      required: ['fromToken', 'toToken'],
    },
  },
  {
    name: 'web_search',
    description:
      'Search for current news, sentiment, protocol analysis, and market conditions relevant to the user query.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query string.',
        },
      },
      required: ['query'],
    },
  },
] as const;

export type ResearchToolName = (typeof RESEARCH_TOOLS)[number]['name'];
