import { NextResponse } from 'next/server';
import { fetch0xQuote } from '@warden/core';

export async function POST(req: Request) {
  try {
    const { parsedIntent, userAddress } = await req.json();
    
    // We only fetch quotes for swaps.
    if (!parsedIntent || parsedIntent.type !== 'swap') {
      return NextResponse.json({ error: 'Invalid intent type for 0x quote' }, { status: 400 });
    }

    if (!userAddress) {
      return NextResponse.json({ error: 'Missing userAddress' }, { status: 400 });
    }

    // The core quote library relies on ZERO_EX_API_KEY env
    const result = await fetch0xQuote(parsedIntent, userAddress);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Quote routing failed:', error);
    return NextResponse.json({ error: 'Quote resolution failed' }, { status: 500 });
  }
}
