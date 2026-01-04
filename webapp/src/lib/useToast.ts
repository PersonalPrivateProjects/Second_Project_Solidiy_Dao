
// src/components/useToast.ts
"use client";

import { useToastContext } from "../components/ToastProvider";


export function useToast() {
  const ctx = useToastContext();
  if (!ctx) {
    // Ayuda de DX si el Provider no está montado
    throw new Error("useToast() debe usarse dentro de <ToastProvider/>");
  }
  return ctx;
}
