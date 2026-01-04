
// src/components/DAOStats.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getSignerAddress,
  getSignerEthBalanceWei,
  getDaoTreasuryBalanceWei,
  getDaoTotalDepositedWei,
  getUserContributionWei,
  depositToDaoDirect,
  formatEth,
  parseEth,
} from "../lib/daoHelpers";
import { getEthereum, onAccountsChanged, onChainChanged } from "../lib/web3";
import { getDAOVoting } from "../lib/contracts";
import { useToast } from "../lib/useToast"; 

type LoadState = "idle" | "loading" | "error";

export default function DAOStats() {
  const { success: toastSuccess, error: toastError } = useToast(); // ⬅️ hook
  const [account, setAccount] = useState<string | null>(null);

  // Métricas que pediste: balance del signer y tesorería del DAO
  const [signerEth, setSignerEth] = useState<string>("—");
  const [treasuryEth, setTreasuryEth] = useState<string>("—");

  // (Opcional) métricas adicionales útiles
  const [totalDepositedEth, setTotalDepositedEth] = useState<string>("—");
  const [myContributionEth, setMyContributionEth] = useState<string>("—");

  // Depósito
  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canDeposit = useMemo(() => {
    return amount.trim().length > 0 && Number(amount) > 0;
  }, [amount]);

  // Cargar métricas
  async function loadStats(acc: string | null) {
    try {
      // Tesorería del DAO
      const treasuryWei = await getDaoTreasuryBalanceWei();
      setTreasuryEth(formatEth(treasuryWei));

      // Balance del signer
      if (acc) {
        const signerWei = await getSignerEthBalanceWei(acc);
        setSignerEth(formatEth(signerWei));
      } else {
        setSignerEth("—");
      }

      // (Opcional) tracking y tu contribución
      try {
        const totalWei = await getDaoTotalDepositedWei();
        setTotalDepositedEth(formatEth(totalWei));
      } catch {
        // ignore
      }
      if (acc) {
        try {
          const contribWei = await getUserContributionWei(acc);
          setMyContributionEth(formatEth(contribWei));
        } catch {
          // ignore
        }
      } else {
        setMyContributionEth("—");
      }
    } catch (err) {
      const msg = "Error al cargar métricas del DAO.";
      console.error("loadStats error:", err);
      setErrorMsg("Error al cargar métricas del DAO.");
      toastError(msg, { title: "Carga de métricas" });
    }
  }

  // Inicial: cuenta + métricas
  useEffect(() => {
    (async () => {
      if (!getEthereum()) {        
        const msg = "MetaMask no detectada. Conecta tu wallet para ver métricas.";
        toastInfo(msg, { title: "Wallet requerida" }); // ⬅️ nuevo
        return;
      };
      const acc = await getSignerAddress();
      setAccount(acc);
      await loadStats(acc);
    })();
  }, []);

  // Listeners: cambios de cuenta y chain
  useEffect(() => {
    const offAcc = onAccountsChanged(async (accounts) => {
      const acc = accounts[0] ?? null;
      setAccount(acc);
      await loadStats(acc);
    });
    const offChain = onChainChanged(async () => {
      const acc = await getSignerAddress();
      setAccount(acc);
      await loadStats(acc);
    });
    return () => {
      offAcc?.();
      offChain?.();
    };
  }, []);

  // Refresco por evento Funded del contrato
  useEffect(() => {
    let dao: any = null;
    (async () => {
      try {
        dao = await getDAOVoting("read");
        const handler = async () => {
          const acc = await getSignerAddress();
          await loadStats(acc);
          toastInfo("Tesorería actualizada por un depósito.", { title: "Evento Funded" });
        };
        dao.on("Funded", handler);
      } catch {
        // ignore
      }
    })();
    return () => {
      try {
        dao?.removeAllListeners?.("Funded");
      } catch {
        // ignore
      }
    };
  }, []);

  const handleDeposit = async () => {
    setLoading("loading");
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!getEthereum()) throw new Error("Conecta Metamask.");
      const acc = account ?? (await getSignerAddress());
      if (!acc) throw new Error("Wallet no conectada.");

      const valueWei = parseEth(amount);
      await depositToDaoDirect(valueWei);
      
      const okMsg = `Depósito ejecutado: ${amount} ETH`;
      setSuccessMsg(okMsg);
      toastSuccess(okMsg, { title: "Depósito exitoso" });
      setAmount("");

      await loadStats(acc);
    } catch (err: any) {
      console.error("handleDeposit error:", err);
      const msg = err?.reason || err?.message || "Error al depositar.";
      setErrorMsg(msg);
      toastError(msg, { title: "Depósito fallido" });
    } finally {
      setLoading("idle");
    }
  };

  return (
    <div className="p-4 space-y-6">
      <header className="space-y-1">
        <h3 className="text-base font-semibold">DAO Stats / Tesorería</h3>
        <p className="text-sm text-neutral-400">
          Deposita ETH a la tesorería y revisa métricas básicas.
        </p>
      </header>

      {/* Métricas solicitadas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-md bg-neutral-800 p-3">
          <div className="text-xs text-neutral-400">Tesorería (on‑chain)</div>
          <div className="mt-1 text-lg font-semibold">{treasuryEth} ETH</div>
        </div>
        <div className="rounded-md bg-neutral-800 p-3">
          <div className="text-xs text-neutral-400">Tu balance</div>
          <div className="mt-1 text-lg font-semibold">{signerEth} ETH</div>
        </div>
      </div>

      {/* (Opcional) métricas extra */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-md bg-neutral-800 p-3">
          <div className="text-xs text-neutral-400">Total aportado (tracking)</div>
          <div className="mt-1 text-lg font-semibold">{totalDepositedEth} ETH</div>
        </div>
        <div className="rounded-md bg-neutral-800 p-3">
          <div className="text-xs text-neutral-400">Tu contribución al DAO</div>
          <div className="mt-1 text-lg font-semibold">{myContributionEth} ETH</div>
        </div>
      </div>

      {/* Formulario de depósito */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Depositar ETH</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm placeholder:text-neutral-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleDeposit}
            disabled={!canDeposit || loading === "loading"}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading === "loading" ? "Depositando…" : "Depositar"}
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          * El depósito se registra en la tesorería del DAO. Depositar ETH te permite participar en votaciones (balance mínimo requerido).
        </p>

        {errorMsg && <div className="text-xs text-red-400">{errorMsg}</div>}
        {successMsg && <div className="text-xs text-emerald-400">{successMsg}</div>}
      </div>
    </div>
  );
}
function toastInfo(msg: string, arg1: { title: string; }) {
  throw new Error("Function not implemented.");
}

