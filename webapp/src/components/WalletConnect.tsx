
// src/components/WalletConnect.tsx
"use client";

import { useEffect, useState } from "react";
import {
  connectWallet,
  getBalance,
  getChainId,
  onAccountsChanged,
  onChainChanged,
  LOCAL_CHAIN_ID_DEC,
  getEthereum,
} from "../lib/web3";

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletConnect() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>("—");
  const [chainId, setChainId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar chain al montar si hay ethereum
  useEffect(() => {
    (async () => {
      if (!getEthereum()) return;
      const cid = await getChainId();
      if (cid) setChainId(cid);
    })();
  }, []);

  // Listeners: cuentas y chain
  useEffect(() => {
    const offAcc = onAccountsChanged(async (accounts) => {
      const addr = accounts[0] ?? null;
      setAddress(addr);
      if (addr) {
        const { eth } = await getBalance(addr);
        setBalance(Number(eth).toFixed(4));
      } else {
        setBalance("—");
      }
    });
    const offChain = onChainChanged(async () => {
      const cid = await getChainId();
      setChainId(cid);
      if (address) {
        const { eth } = await getBalance(address);
        setBalance(Number(eth).toFixed(4));
      }
    });
    return () => {
      offAcc?.();
      offChain?.();
    };
  }, [address]);

  const handleConnect = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { address: addr, chainId: cid } = await connectWallet();
      setAddress(addr);
      setChainId(cid);
      if (addr) {
        const { eth } = await getBalance(addr);
        setBalance(Number(eth).toFixed(4));
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Error al conectar la wallet.");
    } finally {
      setLoading(false);
    }
  };

  const connected = Boolean(address);

  return (
    <div className="flex items-center gap-3">
      <div className="hidden md:flex items-center gap-3 text-sm">
        <span className="text-neutral-400">Wallet:</span>
        <span className="text-neutral-200">
          {connected ? truncate(address!) : "No conectada"}
        </span>
        <span className="mx-2 text-neutral-700">|</span>
        <span className="text-neutral-400">Balance:</span>
        <span className="text-neutral-200">{balance} ETH</span>
        {chainId !== null && (
          <>
            <span className="mx-2 text-neutral-700">|</span>
            <span className="text-neutral-400">Chain:</span>
            <span
              className={
                chainId === LOCAL_CHAIN_ID_DEC ? "text-emerald-400" : "text-amber-400"
              }
            >
              {chainId}
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={handleConnect}
        disabled={loading}
        className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-50"
      >
        {loading ? "Conectando…" : connected ? "Actualizar" : "Conectar Wallet"}
      </button>

      {errorMsg && <span className="text-xs text-red-400 max-w-[240px]">{errorMsg}</span>}
    </div>
  );
}
