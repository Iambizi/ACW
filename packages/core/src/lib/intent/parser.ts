import { INTENT_SYSTEM_PROMPT } from './prompts';
import type { IntentParser, ParseResult } from './types';
import type { ParsedIntent } from '../../types';

export const claudeParser: IntentParser = {
  async parse(input: string): Promise<ParseResult> {
    const startTime = Date.now();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307', // fast model for intent parsing
          max_tokens: 1024,
          system: INTENT_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: input,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const rawText = data.content?.[0]?.text || '';
      
      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(rawText);
        
        if (!parsedPayload.type || !['swap', 'transfer', 'stake', 'unknown'].includes(parsedPayload.type)) {
          throw new Error('Invalid intent type returned');
        }
      } catch (parseError) {
        parsedPayload = {
          type: 'unknown',
          rawConfidence: 0,
          ambiguities: ['Failed to parse structured JSON from Claude response'],
        };
      }

      // Hydrate JSON strings into BigInts according to the ParsedIntent contract
      const intent = hydrateBigInts(parsedPayload);
      const durationMs = Date.now() - startTime;

      return {
        intent,
        toolTrace: {
          toolName: 'claude_parser',
          input: { input },
          output: { parsedIntent: intent },
          timestamp: startTime,
          durationMs,
        },
      };

    } catch (error) {
       const durationMs = Date.now() - startTime;
       const fallbackIntent: ParsedIntent = {
         type: 'unknown',
         rawConfidence: 0,
         ambiguities: [(error as Error).message],
       };

       return {
         intent: fallbackIntent,
         toolTrace: {
           toolName: 'claude_parser',
           input: { input },
           output: { error: (error as Error).message },
           timestamp: startTime,
           durationMs,
         }
       };
    }
  },
};

/**
 * Normalizes JSON parsing quirks and ensures numerical fields become valid BigInts
 * as required by the strict `ParsedIntent` discriminated union.
 */
function hydrateBigInts(rawJSON: any): ParsedIntent {
  const copy = { ...rawJSON };

  if (copy.type === 'swap' && typeof copy.fromAmount !== 'bigint') {
    try { copy.fromAmount = BigInt(copy.fromAmount); } catch (e) { copy.fromAmount = 0n; }
  } else if ((copy.type === 'transfer' || copy.type === 'stake') && typeof copy.amount !== 'bigint') {
    try { copy.amount = BigInt(copy.amount); } catch (e) { copy.amount = 0n; }
  }
  
  if (typeof copy.rawConfidence !== 'number') {
    copy.rawConfidence = parseFloat(copy.rawConfidence || "0");
    if (isNaN(copy.rawConfidence)) copy.rawConfidence = 0;
  }
  
  if (!Array.isArray(copy.ambiguities)) {
    copy.ambiguities = [];
  }

  return copy as ParsedIntent;
}
