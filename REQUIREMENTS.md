## KRChange Frontend Requirements

### Networks

- Support KasPlex Testnet and Mainnet selection.
- Default to Testnet unless `public/config.json` sets `defaultNetwork`.
- Do not hardcode secrets; use `.env` for any private keys. Provide `env.example`.

### Pages & IA

- Top navigation: left Logo (`KRChange`), center links `Liquidity`, `Swap`, right GitHub/Twitter icons, real `Connect Wallet`, network picker.
- Home (`/`) must redirect to `/swap`.
- `/liquidity`:
  - List available pairs from the Factory (no mock stats/KPIs).
  - Allow navigating to Add Liquidity and Create Pair flows.
  - Minimal on-chain reads only (e.g., `allPairsLength`, `allPairs`, token addresses).
- `/liquidity/add` and `/liquidity/create`:
  - Placeholder UIs with basic form shells.
- `/swap`:
  - Shell with From/To selectors, amount input, price impact line, disabled Swap button.
  - Token picker via simple dialog populated from `public/tokenlist.json` for the active chain.

### Styling

- Tailwind dark theme, cyan/teal primary, grays, success/danger.
- Background gradient and dotted grid utilities.
- Neumorphic cards, subtle shadows, consistent radius.

### Components

- `Logo`, `TopNav`, `LoadingTokens`, `TokenTable` (optional), `Sparkline` (optional).
- Utilities: `cn` (already), `format.ts` for number/currency/percent.

### Data & Token Assets

- Token images in `public/tokens/<chainId>/*`. Maintain `public/tokenlist.json` and use it for token pickers.

### Blockchain

- Use ABIs from `src/out`.
- Contracts (testnet):
  - Factory: `0xa1b0785Cb418D666BE9069400f4d4D7a86e3F5e0`
  - Router: `0x820d8AE8378eD32eFfa50C93A0ee06e5942FB175`
  - AmmZapV1: `0x991291B2bB4c49228a687CeD72EABd34d7Aeaa0b`
- Implement simple reads against Testnet (e.g., list pairs from Factory).

### Quality

- `npm run dev` compiles with zero TS or ESLint errors.
- Include README with run instructions and screenshots notes.
