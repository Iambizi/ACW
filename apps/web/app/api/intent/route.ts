import { NextResponse } from 'next/server';
import { claudeParser } from '@warden/core';
import { checkRateLimit, getIp } from '../../lib/rateLimiter';

export async function POST(req: Request) {
  const limit = checkRateLimit(getIp(req));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Retry in ${limit.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const { input } = await req.json();
    if (!input || typeof input !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid input' }, { status: 400 });
    }

    // Call the core library parser. (Relies on ANTHROPIC_API_KEY env)
    const result = await claudeParser.parse(input);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Intent parsing failed:', error);
    return NextResponse.json({ error: 'Intent parsing failed' }, { status: 500 });
  }
}
