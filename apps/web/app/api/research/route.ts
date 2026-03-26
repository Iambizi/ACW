import { NextResponse } from 'next/server';
import { geminiResearchAgent } from '@warden/core/src/lib/research/agent';
import type { ThinkingLevel } from '@warden/core/src/lib/research/types';

/**
 * POST /api/research
 *
 * Third and final API route. Server-side only.
 * GOOGLE_AI_API_KEY must never be prefixed with NEXT_PUBLIC_.
 *
 * Request:  { input: string; thinkingLevel?: ThinkingLevel }
 * Response: ResearchResult
 *
 * This route does NOT produce a ProposalObject.
 * It does NOT call ApprovalManager.
 * It does NOT touch the chain.
 * It is a pure information flow — research results only.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { input, thinkingLevel } = body;

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return NextResponse.json(
        { error: 'input must be a non-empty string' },
        { status: 400 }
      );
    }

    const validLevels: ThinkingLevel[] = ['minimal', 'low', 'medium', 'high'];
    const level: ThinkingLevel =
      validLevels.includes(thinkingLevel) ? thinkingLevel : 'low';

    const result = await geminiResearchAgent.research(input.trim(), level);

    return NextResponse.json(result);
  } catch (error) {
    const message = (error as Error).message ?? 'Research agent failed';
    console.error('[/api/research]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
