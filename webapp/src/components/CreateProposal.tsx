
// src/components/CreateProposal.tsx
"use client";

import { useState } from "react";
import { ethers } from "ethers";
import {
  parseEth,
  createProposalDirect,
  buildCreateProposalMetaTx,
  sendMetaTxToRelayer,
  getSignerAddress,
  // Si agregaste este helper en daoHelpers, úsalo:
  // (de lo contrario, puedes comentar el import y saltarte la pre-validación)
  preValidateCreateProposal,
} from "../lib/daoHelpers";
import { toSeconds, formatDurationSeconds } from "../lib/timeHelpers";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (proposalId?: number) => void; // Para refrescar listas
};

type DurationUnit = "seconds" | "minutes" | "hours" | "days";

// Serializa ForwardRequest (evita BigInt en JSON)
function serializeForwardRequest(req: any) {
  return {
    from: req.from,
    to: req.to,
    value: req.value?.toString?.() ?? String(req.value ?? 0),
    gas: req.gas?.toString?.() ?? String(req.gas ?? 0),
    nonce: req.nonce?.toString?.() ?? String(req.nonce ?? 0),
    data: req.data,
  };
}

export default function CreateProposal({ open, onClose, onCreated }: Props) {
  const [recipient, setRecipient] = useState<string>("");
  const [amount, setAmount] = useState<string>(""); // ETH

  const [durationValue, setDurationValue] = useState<string>("1"); // por defecto 1 día
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("days");

  const [description, setDescription] = useState<string>("");

  const [gasless, setGasless] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isRecipientOk =
    recipient.trim().length > 0 &&
    ethers.isAddress(recipient) &&
    recipient.toLowerCase() !== ethers.ZeroAddress;

  const canSubmit =
    isRecipientOk &&
    amount.trim().length > 0 &&
    Number(amount) > 0 &&
    durationValue.trim().length > 0 &&
    Number(durationValue) > 0 &&
    description.trim().length > 0;

  const reset = () => {
    setRecipient("");
    setAmount("");
    setDurationValue("1");
    setDurationUnit("days");
    setDescription("");
    setGasless(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleCreate = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const from = await getSignerAddress();
      if (!from) throw new Error("Wallet no conectada.");

      const amountWei = parseEth(amount);
      const durationSec = toSeconds(Number(durationValue), durationUnit);
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        throw new Error("Duración inválida");
      }

      // Pre-validación de contrato (opcional pero recomendable)
      if (typeof preValidateCreateProposal === "function") {
        const { ok, issues } = await preValidateCreateProposal(from, amountWei);
        if (!ok) {
          setErrorMsg(issues.join(" "));
          setLoading(false);
          return;
        }
      }

      if (gasless) {
        // Gasless → firma EIP-712 y envía al relayer
        const { request, signature } = await buildCreateProposalMetaTx(
          from,
          recipient,
          amountWei,
          durationSec,
          description
        );

        // Serializamos BigInt -> string para JSON
        const safeReq = serializeForwardRequest(request);
        const { txHash } = await sendMetaTxToRelayer(safeReq, signature);

        setSuccessMsg(`Propuesta enviada vía gasless. Tx: ${txHash}`);
      } else {
        // Directo → signer paga gas
        const receipt = await createProposalDirect(
          recipient,
          amountWei,
          durationSec,
          description
        );
        setSuccessMsg(`Propuesta creada. Tx: ${receipt.hash}`);
      }

      // Notificar a padre para refrescar lista (si aplica)
      onCreated?.();

      // Cerrar y limpiar
      reset();
      onClose();
    } catch (err: any) {
      const msg = err?.reason || err?.message || "Error al crear propuesta";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="w-full max-w-lg rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <header className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Nueva propuesta</h3>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-neutral-400 hover:text-neutral-200"
          >
            ✕
          </button>
        </header>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium">Beneficiario (recipient)</label>
            <input
              type="text"
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:outline-none"
            />
            {!isRecipientOk && recipient.length > 0 && (
              <p className="mt-1 text-xs text-red-400">
                Dirección inválida o cero-address.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">Monto en ETH</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:outline-none"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Debe existir saldo on‑chain suficiente en el contrato para cubrir este monto.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium">Duración de la votación</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={durationValue}
                onChange={(e) => setDurationValue(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:outline-none"
              />
              <select
                value={durationUnit}
                onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:outline-none"
              >
                <option value="seconds">Segundos</option>
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Días</option>
              </select>
            </div>

            {/* Preview amigable */}
            <p className="mt-1 text-xs text-neutral-500">
              Equivalente: {toSeconds(Number(durationValue), durationUnit)} s
              {" "}
              ({formatDurationSeconds(toSeconds(Number(durationValue), durationUnit))})
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium">Descripción</label>
            <textarea
              rows={3}
              placeholder="Describe la propuesta..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="gasless"
              type="checkbox"
              checked={gasless}
              onChange={(e) => setGasless(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="gasless" className="text-sm">
              Usar meta‑transacción (gasless, vía relayer)
            </label>
          </div>

          {errorMsg && <div className="text-xs text-red-400">{errorMsg}</div>}
          {successMsg && <div className="text-xs text-emerald-400">{successMsg}</div>}
        </div>

        <footer className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canSubmit || loading}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "Creando…" : "Crear propuesta"}
          </button>
        </footer>
      </div>
    </div>
  );
}
