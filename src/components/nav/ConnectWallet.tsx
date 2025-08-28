"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { getPublicConfig } from "@/lib/chain";

import type { Eip1193Provider } from "ethers";

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

type Eip1193WithEvents = Eip1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

function shortenAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function ConnectWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [networks, setNetworks] = useState<{ id: number; name: string }[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const justOpenedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const log = (...args: unknown[]) => {
    // Lightweight namespaced logger
    try {
      console.log("[ConnectWallet]", ...args);
    } catch {}
  };

  useEffect(() => {
    const eth = window.ethereum as Eip1193WithEvents | undefined;
    if (!eth) return;

    log("mounted, ethereum present:", Boolean(eth));
    eth
      .request({ method: "eth_accounts" })
      .then((res) => {
        const accounts = (res as unknown as string[]) || [];
        log("eth_accounts ->", accounts);
        if (accounts && accounts.length > 0) setAccount(accounts[0]);
      })
      .catch(() => {});

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) || [];
      setAccount(accounts && accounts.length > 0 ? accounts[0] : null);
    };
    eth.on?.("accountsChanged", onAccountsChanged);
    log("attached accountsChanged listener");
    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getPublicConfig();
        setNetworks(
          Object.entries(cfg.networks).map(([k, v]) => ({ id: Number(k), name: v.name }))
        );
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const top = Math.round(rect.bottom + 8);
      const right = Math.round(window.innerWidth - rect.right);
      setMenuPos({ top, right });
      log("menu position", { top, right });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [menuOpen]);

  const connect = async () => {
    const eth = window.ethereum;
    if (!eth) {
      log("connect -> no ethereum, opening metamask site");
      window.open("https://metamask.io/", "_blank", "noopener,noreferrer");
      return;
    }
    try {
      setConnecting(true);
      log("connect -> requesting accounts");
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as unknown as string[];
      log("connect -> accounts:", accounts);
      setAccount(accounts && accounts.length > 0 ? accounts[0] : null);
    } catch {
      // ignore
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    // Dapps cannot programmatically disconnect MetaMask; clear local state instead.
    log("disconnect -> clearing local state");
    setAccount(null);
    setMenuOpen(false);
  };

  const switchWallet = async () => {
    try {
      log("switchWallet -> requestPermissions(eth_accounts)");
      await window.ethereum?.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      log("switchWallet -> eth_requestAccounts");
      const accounts = (await window.ethereum?.request({ method: "eth_requestAccounts" })) as unknown as string[];
      log("switchWallet -> accounts:", accounts);
      setAccount(accounts && accounts.length > 0 ? accounts[0] : null);
    } catch {
      // ignore
    } finally {
      setMenuOpen(false);
    }
  };

  const switchNetwork = async (id: number) => {
    try {
      const hex = "0x" + id.toString(16);
      log("switchNetwork ->", { id, hex });
      await window.ethereum?.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
    } catch {
      // ignore wallet errors
    } finally {
      try {
        window.localStorage.setItem("networkId", String(id));
      } catch {}
      log("switchNetwork -> dispatch krchange:network-changed", { id });
      window.dispatchEvent(new CustomEvent("krchange:network-changed", { detail: { chainId: id } }));
      setMenuOpen(false);
    }
  };

  if (account) {
    return (
      <div
        className="relative"
        ref={menuRef}
      >
        <button
          ref={buttonRef}
          onClick={() => {
            const next = !menuOpen;
            log("toggle menu", { next });
            if (next) {
              justOpenedRef.current = true;
              // Allow the current click to finish before enabling outside-close
              setTimeout(() => {
                justOpenedRef.current = false;
                log("menu justOpenedRef reset");
              }, 0);
            }
            setMenuOpen(next);
          }}
          className="inline-flex items-center justify-center h-9 rounded-md px-3 bg-secondary text-sm hover:bg-secondary/80 transition-colors"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="mr-1">{shortenAddress(account)}</span>
          <ChevronDown size={16} />
        </button>
        {menuOpen &&
          createPortal(
            <div className="fixed inset-0 z-[20000]" onPointerDown={() => setMenuOpen(false)}>
              <div
                role="menu"
                className="absolute w-56 rounded-md border border-border bg-popover shadow-md p-1"
                style={{ top: `${menuPos.top}px`, right: `${menuPos.right}px` }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary text-sm"
                  onMouseDown={(e) => {
                    log("menuitem: switch wallet mousedown", { button: e.button });
                    switchWallet();
                  }}
                  role="menuitem"
                >
                  Switch Wallet
                </button>
                <button
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary text-sm"
                  onMouseDown={(e) => {
                    log("menuitem: disconnect mousedown", { button: e.button });
                    disconnect();
                  }}
                  role="menuitem"
                >
                  Disconnect
                </button>
                <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">Switch Network</div>
                <div className="px-2 pb-2">
                  <select
                    className="w-full h-9 px-2 rounded-md bg-secondary text-sm"
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      log("menuitem: select network", { value });
                      switchNetwork(value);
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select network
                    </option>
                    {networks.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="inline-flex items-center justify-center h-9 rounded-md px-4 bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:opacity-100 transition-opacity disabled:opacity-70"
      aria-label="Connect Wallet"
    >
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}


