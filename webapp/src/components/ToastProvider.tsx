
// src/components/ToastProvider.tsx
"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import clsx from "clsx";

type ToastKind = "success" | "error" | "info";
type ToastItem = {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  duration?: number; // ms
};

type ToastContextValue = {
  show: (kind: ToastKind, message: string, opts?: { title?: string; duration?: number }) => void;
  success: (message: string, opts?: { title?: string; duration?: number }) => void;
  error: (message: string, opts?: { title?: string; duration?: number }) => void;
  info: (message: string, opts?: { title?: string; duration?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setQueue((q) => q.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((kind: ToastKind, message: string, opts?: { title?: string; duration?: number }) => {
    const id = Math.random().toString(36).slice(2);
    const duration = opts?.duration ?? 4000; // 4s por defecto
    const toast: ToastItem = { id, kind, title: opts?.title, message, duration };
    setQueue((q) => [...q, toast]);
    // auto-dismiss
    setTimeout(() => remove(id), duration);
  }, [remove]);

  const success = useCallback((message: string, opts?: { title?: string; duration?: number }) => show("success", message, opts), [show]);
  const error = useCallback((message: string, opts?: { title?: string; duration?: number }) => show("error", message, opts), [show]);
  const info = useCallback((message: string, opts?: { title?: string; duration?: number }) => show("info", message, opts), [show]);

  // Evita saturación: máximo 5 en pantalla
  useEffect(() => {
    if (queue.length > 5) setQueue((q) => q.slice(q.length - 5));
  }, [queue.length]);

  return (
    <ToastContext.Provider value={{ show, success, error, info }}>
      {children}
      {/* Contenedor (bottom-right) */}
      <div className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2">
        {queue.map((t) => (
          <Toast key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const bg = item.kind === "success"
    ? "bg-emerald-700/90 border-emerald-500"
    : item.kind === "error"
    ? "bg-red-700/90 border-red-500"
    : "bg-neutral-700/90 border-neutral-500";

  const icon = item.kind === "success" ? "✓" : item.kind === "error" ? "⚠" : "ℹ";

  return (
    <div
      className={clsx(
        "min-w-[280px] max-w-[360px] rounded-lg border px-3 py-2 text-sm text-neutral-100 shadow-lg backdrop-blur",
        bg
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <div className="text-base">{icon}</div>
        <div className="flex-1">
          {item.title && <div className="font-semibold">{item.title}</div>}
          <div className="text-[13px] leading-snug truncate whitespace-nowrap overflow-hidden">
            {item.message}
            </div>
        </div>
        <button
          onClick={onClose}
          className="text-neutral-200/80 hover:text-neutral-100"
          aria-label="Cerrar notificación"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// Exponer el contexto para el hook (en useToast.ts)
export function useToastContext() {
  return useContext(ToastContext);
}
