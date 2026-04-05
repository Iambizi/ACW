'use client';

import React from 'react';
import { ApprovalGate } from '@warden/ui/src/oversight/ApprovalGate';
import { ConfidenceMeter } from '@warden/ui/src/oversight/ConfidenceMeter';
import type { ApprovalGateProps } from '@warden/ui/src/oversight/ApprovalGate/ApprovalGate.types';

type CompositeGateProps = ApprovalGateProps & {
  confidenceScore: number;
  hideConfidence?: boolean;
};

export function CompositeGate({ confidenceScore, hideConfidence, ...gateProps }: CompositeGateProps) {
  return (
    <div className="flex flex-col border border-zinc-200 bg-white rounded-xl shadow-sm overflow-hidden">
      {/* The actual gate, but we strip its native borders so it fuses with the container */}
      <div className="[&>div]:border-none [&>div]:shadow-none [&>div]:rounded-none">
        <ApprovalGate {...gateProps} />
      </div>
      
      {/* Footer is only rendered if AI confidence is relevant */}
      {!hideConfidence && (
        <div className="px-5 pb-5 pt-2 border-t border-zinc-100 bg-zinc-50/50">
          <div className="text-xs font-semibold text-zinc-500 mb-3 tracking-wide uppercase">AI Confidence Target</div>
          <ConfidenceMeter value={confidenceScore} />
        </div>
      )}
    </div>
  );
}
