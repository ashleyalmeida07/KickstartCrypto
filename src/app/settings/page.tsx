'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, signOut } from 'next-auth/react';
import { useAccount, useDisconnect } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Settings, User, Wallet, Shield, Save, CheckCircle,
  AlertCircle, Loader2, ExternalLink, Copy, ArrowLeft,
  Unplug, PlugZap, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  wallet_address: string;
  bio: string;
  auth_provider: string;
  created_at: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { address, isConnected }  = useAccount();
  const { openConnectModal }      = useConnectModal();
  const { disconnect }            = useDisconnect();

  const [profile, setProfile]       = useState<UserProfile | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [name, setName]             = useState('');
  const [bio, setBio]               = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading]     = useState(false);
  const [deleteConfirm, setDeleteConfirm]     = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/auth/login?callbackUrl=/settings');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/user/profile')
      .then(r => r.json())
      .then((data: UserProfile) => {
        setProfile(data);
        setName(data.name ?? '');
        setBio(data.bio ?? '');
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [status]);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, bio }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSaved(true);
      toast.success('Profile updated!');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast.success('Address copied!');
  };

  const handleConnectWallet = () => {
    if (openConnectModal) {
      openConnectModal();
    } else {
      toast.error('Wallet connection is currently unavailable.');
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast.success('Wallet disconnected');
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/user/delete', { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Account deleted.');
      await signOut({ redirect: false });
      router.replace('/');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to delete account');
    } finally {
      setDeleteLoading(false);
      setShowDeleteModal(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  const displayAddress = profile?.wallet_address || address;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-purple-600 flex items-center justify-center shadow-md">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Account Settings
            </h1>
            <p className="text-sm text-slate-500">Manage your profile and wallet</p>
          </div>
        </div>
      </motion.div>

      <div className="space-y-6">
        {/* ── Profile Card ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <User className="w-4 h-4 text-sky-500" />
              <h2 className="font-bold text-slate-800 text-sm" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                Profile Information
              </h2>
            </div>
            <div className="p-6 space-y-5">
              {/* Avatar row */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-sky-400 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md">
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    : <span className="text-2xl font-black text-white" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                        {(name || 'U')[0].toUpperCase()}
                      </span>
                  }
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{name || 'Unnamed User'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
                  </p>
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-xs text-sky-700 font-medium">
                    <Shield className="w-3 h-3" />
                    {profile?.auth_provider === 'google' ? 'Google Account' : 'Wallet Account'}
                  </span>
                </div>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
                  Display Name
                </label>
                <input
                  id="settings-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name or pseudonym"
                  maxLength={80}
                  className="input-crypto"
                />
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
                  Email Address
                  {profile?.auth_provider === 'google' && (
                    <span className="ml-2 text-slate-400 font-normal normal-case tracking-normal">(managed by Google)</span>
                  )}
                </label>
                <input
                  type="email"
                  value={profile?.email ?? session?.user?.email ?? ''}
                  disabled
                  className="input-crypto opacity-60 cursor-not-allowed bg-slate-50"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
                  Bio <span className="text-slate-400 font-normal normal-case tracking-normal">— optional</span>
                </label>
                <textarea
                  id="settings-bio"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Tell the community who you are and what you build…"
                  rows={3}
                  maxLength={300}
                  className="input-crypto resize-none"
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{bio.length}/300</p>
              </div>

              {/* Save */}
              <div className="flex justify-end">
                <button
                  id="settings-save-btn"
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex items-center gap-2 py-2.5 px-6 disabled:opacity-60"
                >
                  {saving   ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : saved   ? <><CheckCircle className="w-4 h-4" /> Saved!</>
                  :            <><Save className="w-4 h-4" /> Save Changes</>}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Wallet Card ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-purple-500" />
                <h2 className="font-bold text-slate-800 text-sm" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Connected Wallet
                </h2>
              </div>
              {/* Status badge */}
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                isConnected
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="p-6">
              {isConnected && address ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 mb-0.5 font-medium">Address</p>
                      <p className="font-mono text-sm text-slate-800 truncate">{address}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => copyAddress(address)}
                        className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                        title="Copy address"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <a
                        href={`https://sepolia.etherscan.io/address/${address}`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                        title="View on Etherscan"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-500" />
                    Your private key is never stored or transmitted.
                  </p>

                  <button
                    id="disconnect-wallet-btn"
                    onClick={handleDisconnect}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-all"
                  >
                    <Unplug className="w-4 h-4" /> Disconnect Wallet
                  </button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                    <Wallet className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">No wallet connected</p>
                  <p className="text-xs text-slate-500 mb-5">
                    Connect MetaMask or Phantom to enable on-chain actions.
                  </p>
                  <button
                    id="connect-wallet-btn"
                    onClick={handleConnectWallet}
                    className="btn-primary flex items-center gap-2 mx-auto"
                  >
                    <PlugZap className="w-4 h-4" /> Connect Wallet
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Danger Zone */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm">
            <div className="px-6 py-4 border-b border-red-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <h2 className="font-bold text-red-700 text-sm" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                Danger Zone
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Delete Account</p>
                  <p className="text-xs text-slate-500 mt-0.5">Permanently remove your account and all data. Cannot be undone.</p>
                </div>
                <button
                  id="settings-delete-btn"
                  onClick={() => { setDeleteConfirm(''); setShowDeleteModal(true); }}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 transition-all"
                >
                  <Trash2 className="w-4 h-4" /> Delete Account
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-red-200 shadow-2xl w-full max-w-md p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Delete Account</h3>
                  <p className="text-xs text-slate-500">This action cannot be undone.</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                All your profile data, contributions history, and votes will be permanently deleted.
                Your on-chain campaigns remain on the blockchain and cannot be removed.
              </p>

              <div className="mb-5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
                  Type <span className="font-mono text-red-600">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="input-crypto font-mono"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 btn-secondary py-2.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirm !== 'DELETE' || deleteLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleteLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                    : <><Trash2 className="w-4 h-4" /> Delete My Account</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
