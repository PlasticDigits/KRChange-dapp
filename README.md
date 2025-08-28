## KRChange DEX Frontend

Dark-first UI for KRChange DeFi on KasPlex.

### Run locally

1. Install deps

```
npm install
```

2. Start dev server

```
npm run dev
```

3. Open http://localhost:3000

### Features

- Dark mode-first design with gradient + grid background
- Top navigation with links (Pools, Swap), social icons, Connect Wallet placeholder, and Network picker
- Home redirects to `/pools`
- `/pools`: KPI cards, searchable/sortable token table with sparkline, loading state
- `/swap`: basic swap shell with token pickers and disabled Swap button
- Minimal on-chain health check on `/pools` reads factory owner via ABIs in `src/out`

### Networks

- Networks are defined in `public/config.json` using chainId keys and a `defaultNetworkId`.
- Add a new network by appending under `networks` and placing token images under `public/tokens/<chainId>/`.
- The Network picker reads from `config.json`.

Example `public/config.json` snippet:

```json
{
  "defaultNetworkId": 167012,
  "networks": {
    "167012": {
      "name": "KasPlex Testnet",
      "rpcUrl": "https://rpc.kasplextest.xyz",
      "explorerUrl": "https://explorer.testnet.kasplextest.xyz",
      "currency": { "symbol": "KAS", "decimals": 18 },
      "contracts": {
        "factory": "0xa1b0785Cb418D666BE9069400f4d4D7a86e3F5e0",
        "router": "0x820d8AE8378eD32eFfa50C93A0ee06e5942FB175",
        "ammZapV1": "0x991291B2bB4c49228a687CeD72EABd34d7Aeaa0b"
      }
    }
  }
}
```

### Token assets and tokenlist

- Put token images at `public/tokens/<chainId>/<tokenAddress>.png` (lowercase address).
- Generate `public/tokenlist.json` by querying on-chain metadata (name, symbol, decimals):

```
npm run tokens:gen
```

- You can override RPC/chain when generating:

```
KASPLEX_RPC=https://rpc.kasplextest.xyz CHAIN_ID=167012 npm run tokens:gen
```

### ABIs

- Contract ABIs are under `src/out` and are used for on-chain reads.

### Environment

- Place any secrets in a local `.env` (not committed). Add examples to `env.example` if needed.

### Main files

- Layout and theme: `src/app/layout.tsx`, `src/app/globals.css`
- Navigation: `src/components/brand/Logo.tsx`, `src/components/nav/TopNav.tsx`, `src/components/nav/NetworkPicker.tsx`
- Pages: `src/app/page.tsx` (redirect), `src/app/pools/page.tsx`, `src/app/swap/page.tsx`
- Components: `src/components/kpi/KpiCard.tsx`, `src/components/loaders/LoadingTokens.tsx`, `src/components/tables/TokenTable.tsx`, `src/components/charts/Sparkline.tsx`
- Utilities: `src/lib/format.ts`, `src/lib/chain.ts`, `src/lib/ethers.ts`
- Token tooling: `scripts/generate_tokenlist.py`, `public/tokenlist.json`, `public/tokens/<chainId>/...`
- Docs: `STYLE_GUIDE.md`, `REQUIREMENTS.md`

### Next steps

- Integrate a wallet provider compatible with KasPlex; wire the Connect button
- Replace mock data with real pool/token data from backend or on-chain
- Add token/pool detail pages and routing
- Improve loading/error states and accessibility

### Screenshots

- Add screenshots by placing images under `public/` and linking them here.
