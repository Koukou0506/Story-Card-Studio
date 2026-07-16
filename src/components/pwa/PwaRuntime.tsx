"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaRuntimeValue {
  isOnline: boolean;
  installAvailable: boolean;
  installed: boolean;
  updateAvailable: boolean;
  install(): Promise<boolean>;
  activateUpdate(): void;
  dismissUpdate(): void;
}

const PwaRuntimeContext = createContext<PwaRuntimeValue>({
  isOnline: true, installAvailable: false, installed: false, updateAvailable: false,
  install: async () => false, activateUpdate: () => undefined, dismissUpdate: () => undefined,
});

export function PwaRuntime({ children }: { children: ReactNode }) {
  const [isOnline, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorker = useRef<ServiceWorker | null>(null);
  const reloadOnActivate = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const online = () => setOnline(true); const offline = () => setOnline(false);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const installedListener = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    window.addEventListener("beforeinstallprompt", beforeInstall); window.addEventListener("appinstalled", installedListener);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
        if (registration.waiting) { waitingWorker.current = registration.waiting; setUpdateAvailable(true); }
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) { waitingWorker.current = worker; setUpdateAvailable(true); }
          });
        });
      }).catch(() => undefined);
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloadOnActivate.current) window.location.reload(); });
    }
    return () => {
      window.removeEventListener("online", online); window.removeEventListener("offline", offline);
      window.removeEventListener("beforeinstallprompt", beforeInstall); window.removeEventListener("appinstalled", installedListener);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
    return choice.outcome === "accepted";
  }, [installPrompt]);

  const activateUpdate = useCallback(() => { reloadOnActivate.current = true; waitingWorker.current?.postMessage({ type: "SKIP_WAITING" }); }, []);

  return <PwaRuntimeContext.Provider value={{ isOnline, installAvailable: Boolean(installPrompt), installed, updateAvailable, install, activateUpdate, dismissUpdate: () => setUpdateAvailable(false) }}>{children}</PwaRuntimeContext.Provider>;
}

export function usePwaRuntime(): PwaRuntimeValue { return useContext(PwaRuntimeContext); }
