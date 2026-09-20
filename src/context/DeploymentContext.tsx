'use client';
/**
 * DeploymentContext — global deployment tracker.
 *
 * When the user submits a campaign tx on /create, we store the state here
 * so a floating widget can render it from ANY page, surviving navigation.
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type DeployStatus = 'idle' | 'submitting' | 'confirming' | 'registering' | 'done' | 'error';

export interface DeploymentState {
  status:        DeployStatus;
  txHash:        `0x${string}` | undefined;
  campaignTitle: string;
  formData?:     any; // Holds full form state needed for database registration
  campaignAddress: string | undefined;  // set once confirmed + registered
  errorMsg:      string;
}

interface DeploymentContextValue {
  deploy:         DeploymentState;
  startDeployment: (title: string, formData?: any) => void;
  setTxHash:      (hash: `0x${string}`) => void;
  setConfirming:  () => void;
  setRegistering: () => void;
  setDone:        (campaignAddress?: string) => void;
  setError:       (msg: string) => void;
  dismiss:        () => void;
}

const INITIAL: DeploymentState = {
  status: 'idle', txHash: undefined, campaignTitle: '',
  formData: undefined, campaignAddress: undefined, errorMsg: '',
};

const DeploymentContext = createContext<DeploymentContextValue | null>(null);

export function DeploymentProvider({ children }: { children: ReactNode }) {
  const [deploy, setDeploy] = useState<DeploymentState>(INITIAL);

  const startDeployment = useCallback((title: string, formData?: any) =>
    setDeploy({ ...INITIAL, status: 'submitting', campaignTitle: title, formData }), []);

  const setTxHash = useCallback((hash: `0x${string}`) =>
    setDeploy(p => ({ ...p, txHash: hash, status: 'confirming' })), []);

  const setConfirming = useCallback(() =>
    setDeploy(p => ({ ...p, status: 'confirming' })), []);

  const setRegistering = useCallback(() =>
    setDeploy(p => ({ ...p, status: 'registering' })), []);

  const setDone = useCallback((campaignAddress?: string) =>
    setDeploy(p => ({ ...p, status: 'done', campaignAddress })), []);

  const setError = useCallback((msg: string) =>
    setDeploy(p => ({ ...p, status: 'error', errorMsg: msg })), []);

  const dismiss = useCallback(() => setDeploy(INITIAL), []);

  return (
    <DeploymentContext.Provider value={{
      deploy, startDeployment, setTxHash, setConfirming, setRegistering, setDone, setError, dismiss,
    }}>
      {children}
    </DeploymentContext.Provider>
  );
}

export function useDeployment() {
  const ctx = useContext(DeploymentContext);
  if (!ctx) throw new Error('useDeployment must be inside DeploymentProvider');
  return ctx;
}
