"use client";

import { useState, useEffect, useCallback } from "react";

export function useCelariExtension() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      if (typeof window !== "undefined" && window.celari?.isCelari) {
        setIsAvailable(true);
        window.celari
          .getAddress()
          .then((res) => {
            if (res.success && res.address) setAddress(res.address);
          })
          .catch((err) => {
            console.debug("[Celari] getAddress failed:", (err as Error).message);
          });
      }
    };
    check();
    const handler = () => check();
    window.addEventListener("celari#initialized", handler);
    return () => window.removeEventListener("celari#initialized", handler);
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    if (!window.celari) return null;
    try {
      const result = await window.celari.connect();
      if (result.success && result.address) {
        setAddress(result.address);
        return result.address;
      }
    } catch (err) {
      console.debug("[Celari] connect failed:", (err as Error).message);
    }
    return null;
  }, []);

  return { isAvailable, address, connect };
}
