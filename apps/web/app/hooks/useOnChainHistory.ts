'use client';

import { useState, useEffect } from 'react';

/**
 * A single transaction as returned by the Blockscout API.
 * We only map the fields we actually render — the API returns far more.
 */
export interface OnChainTx {
  hash: string;
  from: string;
  to: string | null;
  value: string;          // in wei, as a decimal string
  timestamp: string;      // ISO-8601
  status: 'ok' | 'error';
  method: string | null;  // decoded method name if available
  fee: { value: string }; // gas fee in wei
}

const BASE_SEPOLIA_BLOCKSCOUT = 'https://base-sepolia.blockscout.com/api/v2';

/**
 * useOnChainHistory
 *
 * Fetches the last N transactions for a given address from the
 * free Blockscout API (no API key required).
 *
 * Merges seamlessly with the Zustand ProvenanceLog — callers deduplicate by txHash.
 *
 * PHASE 3 NOTE: If throughput becomes a concern or you need ERC-20 transfers
 * alongside native ETH, swap the endpoint for Alchemy's Transaction History API.
 * The hook interface (address → OnChainTx[]) stays identical.
 */
export function useOnChainHistory(address: `0x${string}` | undefined, limit = 20) {
  const [txs, setTxs] = useState<OnChainTx[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const url = `${BASE_SEPOLIA_BLOCKSCOUT}/addresses/${address}/transactions?limit=${limit}&filter=to%20%7C%20from`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Blockscout responded with ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;

        // Blockscout v2 returns { items: [], next_page_params: ... }
        const items: OnChainTx[] = (data.items ?? []).map((tx: any) => ({
          hash: tx.hash,
          from: tx.from?.hash ?? '',
          to: tx.to?.hash ?? null,
          value: tx.value ?? '0',
          timestamp: tx.timestamp,
          status: tx.status === 'ok' ? 'ok' : 'error',
          method: tx.method ?? null,
          fee: { value: tx.fee?.value ?? '0' },
        }));

        setTxs(items);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [address, limit]);

  return { txs, isLoading, error };
}
