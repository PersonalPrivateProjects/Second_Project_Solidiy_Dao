
// app/page.tsx
"use client";


import "../app/globals.css";

import WalletConnect from "../components/WalletConnect";
import DAOStats from "../components/DAOStats";
import ProposalList from "../components/ProposalList";
import CreateProposal from "../components/CreateProposal";
import { useState } from "react";

  

export default function Page() {
  // ⚠️ Sin lógica: el modal no está cableado. Lo renderizamos cerrado por defecto.
  // Cuando toquemos lógica, manejaremos estado y acciones.

const [openCreate, setOpenCreate] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100">
      {/* Header */}
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold">DAO Voting</span>
            <span className="text-xs rounded bg-neutral-800 px-2 py-1">EIP-2771</span>
          </div>
          <WalletConnect />
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Izquierda: 70% (col-span-2 de 3) */}
          <section className="lg:col-span-2 space-y-4">
            {/* Encabezado de la tabla + botón crear propuesta */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Propuestas</h2>
              {/* El botón debería abrir el modal; por ahora sin lógica */}
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500 focus:outline-none"
                onClick={() => setOpenCreate(true)}
              >
                {/* Ícono plus minimal con CSS */}
                <span className="inline-block h-4 w-4 bg-white/80 [mask:linear-gradient(#000_0_0)] [mask-composite:exclude] relative">
                  {/* decorativo */}
                </span>
                Nueva propuesta
              </button>
            </div>

            {/* Tabla de propuestas */}
            <div className="rounded-lg border border-neutral-800 bg-neutral-900">
              <ProposalList />
            </div>
          </section>

          {/* Derecha: 30% */}
          <aside className="lg:col-span-1">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900">
              <DAOStats />
            </div>
          </aside>
        </div>
      </main>

      {/* Modal (estructura, sin lógica) */}
      {/* Por ahora lo dejamos cerrado (prop open=false) */}
      <CreateProposal open={openCreate} onClose={() => setOpenCreate(false)} onCreated={() => {/* refrescar si quieres */}} />

      {/* Footer */}
      <footer className="border-t border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-neutral-400 flex items-center justify-between">
          <span>© {new Date().getFullYear()} DAO Voting</span>
           <div className="flex items-center gap-4">
            <span>Chain: Local / Anvil</span>
            <span>Forwarder: configurado</span>
            <a
              href="#"
              className="hover:text-neutral-200 underline underline-offset-4">

              </a>
              
           </div>
          </div>
              </footer>
         </div>
       );
 }
           
