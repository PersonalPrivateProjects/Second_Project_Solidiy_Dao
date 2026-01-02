
// src/components/ProposalList.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listProposals,
  Proposal,
  isActive,
  getTimeRemainingSec,
  getTotalVotes,
  getVotePercentages,
  voteDirect,
  VoteType,
  truncate,
  formatEth,
} from "../lib/daoHelpers";
import { getEthereum, onAccountsChanged, onChainChanged } from "../lib/web3";
import { getDAOVoting } from "../lib/contracts";
import { formatDurationSeconds } from "../lib/timeHelpers";

/** Formato alternativo para countdown corto (hh:mm:ss) si quieres */
function formatSecondsCompact(sec: number): string {
  if (sec <= 0) return "0s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ProposalList() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [voteBusyId, setVoteBusyId] = useState<number | null>(null);
  const [tick, setTick] = useState<number>(0); // re-render liviano para countdown

  const sortedProposals = useMemo(() => {
    // Activas primero, luego por ID DESC
    return [...proposals].sort((a, b) => {
      const aActive = isActive(a);
      const bActive = isActive(b);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return b.id - a.id;
    });
  }, [proposals, tick]);

  async function loadAll() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const items = await listProposals();
      setProposals(items);
    } catch (err: any) {
      setErrorMsg(err?.message || "Error al cargar propuestas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      if (!getEthereum()) return;
      await loadAll();
    })();
  }, []);

  // Refrescar al cambiar cuenta/cadena
  useEffect(() => {
    const offAcc = onAccountsChanged(async () => {
      await loadAll();
    });
    const offChain = onChainChanged(async () => {
      await loadAll();
    });
    return () => {
      offAcc?.();
      offChain?.();
    };
  }, []);

  // Suscribir eventos relevantes para refrescar: ProposalCreated, VoteCast, VoteChanged, ProposalExecuted

useEffect(() => {
  let dao: any = null;
  (async () => {
    try {
      dao = await getDAOVoting("read");
      const handler = async () => { await loadAll(); };

      // Usa filtros tipados en lugar del nombre de evento
      dao.on(dao.filters.ProposalCreated(), handler);
      dao.on(dao.filters.VoteCast(), handler);
      dao.on(dao.filters.VoteChanged(), handler);
      dao.on(dao.filters.ProposalExecuted(), handler);
    } catch {
      // ignore
    }
  })();
  return () => {
    try {
      if (dao) {
        dao.removeAllListeners(dao.filters.ProposalCreated());
        dao.removeAllListeners(dao.filters.VoteCast());
        dao.removeAllListeners(dao.filters.VoteChanged());
        dao.removeAllListeners(dao.filters.ProposalExecuted());
      }
    } catch {}
  };
}, []);


  // Tick cada segundo para actualizar countdown sin tocar el array
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(iv);
  }, []);

  async function handleVote(id: number, v: VoteType) {
    setVoteBusyId(id);
    setErrorMsg(null);
    try {
      await voteDirect(id, v);
      await loadAll();
    } catch (err: any) {
      const msg = err?.reason || err?.message || "Error al votar";
      setErrorMsg(msg);
    } finally {
      setVoteBusyId(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      {errorMsg && <div className="text-xs text-red-400 p-2">{errorMsg}</div>}

      <table className="min-w-full text-sm">
        <thead className="bg-neutral-800 text-neutral-300">
          <tr>
            <th className="px-4 py-2 text-left font-medium">ID</th>
            <th className="px-4 py-2 text-left font-medium">Descripción</th>
            <th className="px-4 py-2 text-left font-medium">Creador</th>
            <th className="px-4 py-2 text-left font-medium">Beneficiario</th>
            <th className="px-4 py-2 text-left font-medium">Monto (ETH)</th>
            <th className="px-4 py-2 text-left font-medium">Estado</th>
            <th className="px-4 py-2 text-left font-medium">Tiempo</th>
            <th className="px-4 py-2 text-left font-medium">Totales</th>
            <th className="px-4 py-2 text-left font-medium">% For</th>
            <th className="px-4 py-2 text-left font-medium">% Against</th>
            <th className="px-4 py-2 text-left font-medium">% Abstain</th>
            <th className="px-4 py-2 text-left font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td className="px-4 py-3" colSpan={12}>Cargando…</td>
            </tr>
          )}

          {!loading && sortedProposals.length === 0 && (
            <tr>
              <td className="px-4 py-3" colSpan={12}>Sin propuestas</td>
            </tr>
          )}

          {!loading && sortedProposals.map((p) => {
            const active = isActive(p);
            const timeLeft = getTimeRemainingSec(p);
            const totals = getTotalVotes(p);
            const pct = getVotePercentages(p);

            const amountEth = formatEth(p.amount);
            const recipientTrunc = truncate(p.recipient);

            // Estado más expresivo (opcional)
            let statusLabel = p.executed ? "Ejecutada" : active ? "Activa" : "Finalizada";
            const statusClass = p.executed
              ? "bg-neutral-700"
              : active
              ? "bg-emerald-700"
              : "bg-neutral-800";

            return (
              <tr key={p.id} className="border-t border-neutral-800">
                <td className="px-4 py-3">{p.id}</td>

                <td className="px-4 py-3">{p.description}</td>

                <td className="px-4 py-3">
                  <span className="font-mono">{truncate(p.creator)}</span>
                </td>

                <td className="px-4 py-3">
                  <span className="font-mono">{recipientTrunc}</span>
                </td>

                <td className="px-4 py-3">{amountEth}</td>

                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-1 text-xs ${statusClass}`}>
                    {statusLabel}
                  </span>
                </td>

                <td className="px-4 py-3">
                  {/* Countdown legible */}
                  {formatSecondsCompact(timeLeft)}
                  {/* Opcional: mostrar fecha ejecutable si está finalizada */}
                  {!active && !p.executed && (
                    <div className="text-[11px] text-neutral-500">
                      Ejecutable desde: {new Date(Number(p.executionDelay) * 1000).toLocaleString()}
                    </div>
                  )}
                </td>

                <td className="px-4 py-3">{totals}</td>
                <td className="px-4 py-3">{pct.for}%</td>
                <td className="px-4 py-3">{pct.against}%</td>
                <td className="px-4 py-3">{pct.abstain}%</td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleVote(p.id, VoteType.FOR)}
                      disabled={!active || voteBusyId === p.id}
                      className="rounded bg-emerald-600 px-2 py-1 text-xs hover:bg-emerald-500 disabled:opacity-50"
                    >
                      A favor
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVote(p.id, VoteType.AGAINST)}
                      disabled={!active || voteBusyId === p.id}
                      className="rounded bg-red-600 px-2 py-1 text-xs hover:bg-red-500 disabled:opacity-50"
                    >
                      En contra
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVote(p.id, VoteType.ABSTAIN)}
                      disabled={!active || voteBusyId === p.id}
                      className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600 disabled:opacity-50"
                    >
                      Abstenerse
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
