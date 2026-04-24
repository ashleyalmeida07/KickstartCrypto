import type { Metadata } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['300', '400', '500', '600', '700'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Kickstart Crypto — Decentralized Blockchain Crowdfunding',
  description:
    'Fund the future of blockchain. A trustless, decentralized crowdfunding platform where smart contracts hold escrow, backers vote on milestones, and refunds are automatic.',
  keywords: ['blockchain', 'crowdfunding', 'DeFi', 'crypto', 'Web3', 'Ethereum', 'smart contracts'],
  openGraph: {
    title: 'Kickstart Crypto',
    description: 'Fund the future of blockchain. Trustless crowdfunding powered by smart contracts.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="bg-[#FAFAFA] text-zinc-900 antialiased font-sans">
        <Providers>
          <Navbar />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
