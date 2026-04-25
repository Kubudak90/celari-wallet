"use client";

import { useState, useCallback, useEffect } from "react";
import type { BridgeTransaction } from "@/types/bridge";

const STORAGE_KEY = "celari-bridge-transactions";

export function useLocalTransactions() {
  const [transactions, setTransactions] = useState<BridgeTransaction[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTransactions(JSON.parse(raw));
    } catch {}
  }, []);

  const addTransaction = useCallback((tx: BridgeTransaction) => {
    setTransactions((prev) => {
      const updated = [tx, ...prev].slice(0, 50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateTransaction = useCallback(
    (id: string, updates: Partial<BridgeTransaction>) => {
      setTransactions((prev) => {
        const updated = prev.map((tx) =>
          tx.id === id ? { ...tx, ...updates } : tx
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  return { transactions, addTransaction, updateTransaction };
}
