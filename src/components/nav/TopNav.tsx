"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github, Twitter, Menu, Send } from "lucide-react";
import Logo from "@/components/brand/Logo";
import NetworkPicker from "@/components/nav/NetworkPicker";
import ConnectWallet from "@/components/nav/ConnectWallet";
import { useState } from "react";
import { socialLinks } from "@/lib/links";

export default function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const linkClasses = (href: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      pathname === href ? "text-primary" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <header className="sticky top-0 z-[10000] backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="container-padded h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden md:flex items-center gap-2" aria-label="Main">
            <Link href="/swap" className={linkClasses("/swap")}>
              Swap
            </Link>
            <Link href="/liquidity" className={linkClasses("/liquidity")}>
              Liquidity
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <NetworkPicker />
          <a
            href={socialLinks.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <Github size={18} />
          </a>
          <a
            href={socialLinks.x}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter"
            className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <Twitter size={18} />
          </a>
          <a
            href={socialLinks.telegram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Telegram"
            className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <Send size={18} />
          </a>
          <ConnectWallet />
          <button
            className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-secondary"
            aria-label="Open Menu"
            onClick={() => setOpen((v) => !v)}
          >
            <Menu size={18} />
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-border">
          <div className="container-padded py-2 flex flex-col gap-1">
            <Link href="/swap" className="px-2 py-2 rounded-md hover:bg-secondary" onClick={() => setOpen(false)}>
              Swap
            </Link>
            <Link href="/liquidity" className="px-2 py-2 rounded-md hover:bg-secondary" onClick={() => setOpen(false)}>
              Liquidity
            </Link>
            <div className="flex items-center gap-2 pt-1">
              <a
                href={socialLinks.github}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
              >
                <Github size={18} />
              </a>
              <a
                href={socialLinks.x}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter"
                className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
              >
                <Twitter size={18} />
              </a>
              <a
                href={socialLinks.telegram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
                className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
              >
                <Send size={18} />
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}


