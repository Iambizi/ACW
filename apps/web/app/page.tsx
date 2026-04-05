'use client';

import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance } from 'wagmi';
import { Dashboard } from './components/Dashboard';
import { ManualSendForm } from './components/ManualSendForm';
import { ManualSwapForm } from './components/ManualSwapForm';
import { ChatInput } from './components/ChatInput';
import { ApprovalManager } from './components/ApprovalManager';

type Tab = 'dashboard' | 'send' | 'swap';

export default function Home() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  return (
    <main className="flex min-h-screen flex-col items-center p-8 lg:p-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-200 via-zinc-50 to-zinc-50 -z-10" />
      
      <header className="w-full flex justify-between items-center max-w-5xl mb-12">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 to-zinc-500">
            Warden Console
          </h1>
          <span className="text-xs text-zinc-500 tracking-widest uppercase font-mono mt-1">L3 Delegated Agent</span>
        </div>
        <ConnectButton />
      </header>

      <div className="w-full max-w-5xl flex flex-col gap-8">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center p-24 border border-zinc-200/50 rounded-2xl bg-white/50 backdrop-blur-xl shadow-sm">
            <h2 className="text-xl text-zinc-600 mb-4 tracking-tight">Connect your wallet to begin</h2>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Navigation Tabs */}
            <div className="flex gap-2 p-1 border border-zinc-200/80 rounded-xl bg-white/80 w-fit backdrop-blur-xl shadow-sm">
              {(['dashboard', 'send', 'swap'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab 
                      ? 'bg-zinc-900 text-zinc-50 shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/50'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab Routing */}
            {activeTab === 'dashboard' && <Dashboard address={address} />}
            {activeTab === 'send' && <ManualSendForm userAddress={address} />}
            {activeTab === 'swap' && <ManualSwapForm userAddress={address} />}

            {/* Central Oversight Gate */}
            <div className="w-full max-w-2xl mx-auto mt-6">
              <ApprovalManager />
            </div>
          </div>
        )}
      </div>

      {/* Global Persisted Chat Input for AI Agent */}
      {isConnected && (
         <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-zinc-50 via-zinc-50 to-transparent pointer-events-none flex justify-center z-50">
            <div className="w-full max-w-5xl pointer-events-auto">
               <ChatInput />
            </div>
         </div>
      )}
    </main>
  );
}
