"use client";

import { useAccount, useBalance, useDisconnect } from 'wagmi';
import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, ExternalLink, ArrowDownToLine, Activity } from 'lucide-react';
import toast from 'react-hot-toast';

export default function WalletDashboard() {
  const { address, isConnected, connector } = useAccount();
  const { data: balance, isLoading } = useBalance({ address });
  const { disconnect } = useDisconnect();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  if (!isConnected) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-zinc-50">
        <div className="text-center p-8 max-w-md w-full bg-white border border-zinc-200 shadow-sm rounded-xl">
          <Activity className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Not Connected</h2>
          <p className="text-zinc-500 mb-6">Please connect your embedded wallet to view your dashboard.</p>
        </div>
      </div>
    );
  }

  const isWeb3Auth = connector?.id === 'web3auth';

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success('Address copied to clipboard!');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Wallet Dashboard</h1>
            <p className="text-zinc-500 mt-1">
              Manage your {isWeb3Auth ? 'embedded ' : ''}wallet, check balances, and fund your account.
            </p>
          </div>
          {isWeb3Auth && (
            <button
              onClick={() => disconnect()}
              className="btn-outline px-4 py-2 text-sm text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors"
            >
              Sign Out
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Balance & Address Card */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm flex flex-col">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-6">Your Balance</h2>
            
            <div className="flex items-baseline gap-2 mb-8">
              <span className="text-5xl font-black text-zinc-900">
                {isLoading ? '...' : Number(balance?.formatted || 0).toFixed(4)}
              </span>
              <span className="text-xl font-medium text-zinc-500">{balance?.symbol}</span>
            </div>

            <div className="mt-auto">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Wallet Address</p>
              <div className="flex items-center gap-2 bg-zinc-100 p-3 rounded-lg border border-zinc-200">
                <code className="text-sm text-zinc-700 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {address}
                </code>
                <button
                  onClick={copyAddress}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 bg-white rounded shadow-sm border border-zinc-200 transition-all hover:bg-zinc-50"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Fund Wallet Card */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <ArrowDownToLine className="w-5 h-5 text-emerald-500" />
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Fund Your Wallet</h2>
            </div>
            
            <p className="text-sm text-zinc-600 mb-6">
              Send Sepolia ETH to your embedded wallet to interact with campaigns on the platform.
            </p>

            <div className="flex flex-col items-center justify-center p-6 bg-zinc-50 border border-zinc-200 rounded-xl border-dashed mb-4">
              {address && (
                <div className="p-2 bg-white rounded-lg shadow-sm border border-zinc-100">
                  <QRCodeSVG value={address} size={140} level="H" includeMargin={false} />
                </div>
              )}
            </div>
            
            <a 
              href="https://sepoliafaucet.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-sm font-semibold transition-colors"
            >
              Get Testnet ETH <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Transaction History Placeholder */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-6">Recent Transactions</h2>
          <div className="text-center py-12">
            <Activity className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">
              Your recent transactions will appear here.
            </p>
            <a
              href={`https://sepolia.etherscan.io/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 text-sm text-sky-600 hover:text-sky-700 font-semibold transition-colors"
            >
              View on Etherscan <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
