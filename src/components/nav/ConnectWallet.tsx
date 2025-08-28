"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getPublicConfig } from "@/lib/chain";

declare global {
  interface Window {
    ethereum?: any;
  }
}

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

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    eth.request({ method: "eth_accounts" })
      .then((accounts: string[]) => {
        if (accounts && accounts.length > 0) setAccount(accounts[0]);
      })
      .catch(() => {});

    const onAccountsChanged = (accounts: string[]) => {
      setAccount(accounts && accounts.length > 0 ? accounts[0] : null);
    };
    eth.on?.("accountsChanged", onAccountsChanged);
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
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [menuOpen]);

  const connect = async () => {
    const eth = window.ethereum;
    if (!eth) {
      window.open("https://metamask.io/", "_blank", "noopener,noreferrer");
      return;
    }
    try {
      setConnecting(true);
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      setAccount(accounts && accounts.length > 0 ? accounts[0] : null);
    } catch {
      // ignore
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    // Dapps cannot programmatically disconnect MetaMask; clear local state instead.
    setAccount(null);
    setMenuOpen(false);
  };

  const switchWallet = async () => {
    try {
      await window.ethereum?.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      const accounts: string[] = await window.ethereum?.request({ method: "eth_requestAccounts" });
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
      window.dispatchEvent(new CustomEvent("krchange:network-changed", { detail: { chainId: id } }));
      setMenuOpen(false);
    }
  };

  if (account) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center justify-center h-9 rounded-md px-3 bg-secondary text-sm hover:bg-secondary/80 transition-colors"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="mr-1">{shortenAddress(account)}</span>
          <ChevronDown size={16} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 rounded-md border border-border bg-popover shadow-md p-1 z-50"
          >
            <button
              className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary text-sm"
              onClick={switchWallet}
              role="menuitem"
            >
              Switch Wallet
            </button>
            <button
              className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary text-sm"
              onClick={disconnect}
              role="menuitem"
            >
              Disconnect
            </button>
            <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">Switch Network</div>
            <div className="px-2 pb-2">
              <select
                className="w-full h-9 px-2 rounded-md bg-secondary text-sm"
                onChange={(e) => switchNetwork(Number(e.target.value))}
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


