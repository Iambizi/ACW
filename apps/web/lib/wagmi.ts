import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { baseSepolia } from 'wagmi/chains';

const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

if (!projectId) {
  throw new Error('NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID is not defined');
}

export const config = getDefaultConfig({
  appName: 'Warden Console',
  projectId,
  chains: [baseSepolia],
  ssr: true, // Necessary for Next.js App Router
});
