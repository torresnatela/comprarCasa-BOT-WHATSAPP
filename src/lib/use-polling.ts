"use client";

import { useEffect, useRef } from "react";

/** Chama `callback` a cada `intervalMs` enquanto o componente estiver na tela. */
export function usePolling(callback: () => void, intervalMs: number): void {
  const latest = useRef(callback);

  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(() => {
    const timer = setInterval(() => latest.current(), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
}
