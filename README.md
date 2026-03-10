# NEXUS Entity dApp

A comprehensive blockchain-based entity management platform built on Substrate. Manage organizations, shops, tokens, governance, and more — from browser or desktop.

## Features

- **Entity Management** — Create and manage Merchants, Enterprises, DAOs, Communities, Projects, Service Providers, and Funds
- **Multi-Shop Commerce** — Set up shops, manage products/inventory, handle orders with escrow & dispute resolution
- **Token System** — Issue custom tokens with dividend distribution and vesting schedules
- **Token Market** — On-chain trading with TWAP pricing and order books
- **DAO Governance** — Proposal creation, voting, and execution
- **Member Management** — Tiered membership levels, referrals, and multi-level commission structures
- **KYC & Compliance** — 5-level KYC verification, financial disclosure, insider tracking
- **Token Sale** — Configurable token sale rounds with subscription and claiming
- **Reviews & Ratings** — Product and service review system
- **Desktop Wallet** — Built-in sr25519 keyring with mnemonic backup (Tauri desktop only)
- **Bilingual UI** — English and Chinese (next-intl)
- **Cross-Platform** — Browser + Desktop (Windows / macOS / Linux via Tauri v2)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand + React Query |
| Blockchain | Polkadot.js API (Substrate) |
| Desktop | Tauri v2 |
| i18n | next-intl (EN / ZH) |
| Testing | Vitest + Testing Library |

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Desktop App (Tauri)

Requires [Rust](https://rustup.rs/) and platform-specific dependencies:

**Linux:**
```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev libssl-dev
```

**Windows:** Visual Studio Build Tools (C++ desktop workload) + WebView2

**macOS:** Xcode Command Line Tools

Then run:

```bash
npm run tauri:dev    # development
npm run tauri:build  # production build
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build (static export) |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run tauri:dev` | Launch Tauri desktop dev |
| `npm run tauri:build` | Build desktop installer |

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Home (entity creation + wallet connect)
│   └── [entityId]/             # Entity routes (14 modules)
│       ├── dashboard           # Entity overview
│       ├── settings            # Entity configuration
│       ├── shops/[shopId]/     # Shops → products, orders
│       ├── orders              # Order management
│       ├── token/              # Token → dividend, vesting
│       ├── market              # Token trading
│       ├── members/            # Members → levels, referrals
│       ├── commission          # Commission structure
│       ├── governance/         # Proposals → [proposalId]
│       ├── disclosure          # Financial disclosure
│       ├── kyc                 # KYC verification
│       ├── tokensale           # Token sale rounds
│       └── reviews             # Product reviews
├── components/
│   ├── ui/                     # 24 shadcn/ui components
│   ├── sidebar/                # Navigation sidebar
│   ├── wallet/                 # Desktop wallet dialog
│   └── order/                  # Order-related components
├── hooks/                      # React hooks (wallet, chain queries, mutations)
├── lib/
│   ├── chain/                  # API provider, peer discovery, constants
│   ├── wallet/                 # Desktop keyring (sr25519)
│   ├── types/                  # Enums + interfaces
│   └── utils/                  # Helpers
├── stores/                     # Zustand stores
└── styles/                     # Tailwind globals
src-tauri/                      # Tauri v2 Rust backend
```

## CI/CD

GitHub Actions automatically builds cross-platform desktop installers.

**Trigger a release:**

```bash
git tag v0.1.0
git push origin v0.1.0
```

This creates a draft GitHub Release with:

| Platform | Installer |
|----------|-----------|
| Windows | `.exe` (NSIS) / `.msi` |
| macOS | `.dmg` |
| Linux | `.AppImage` / `.deb` |

You can also trigger a build manually from **Actions → Build & Release → Run workflow**.

## Chain Configuration

Default seed nodes defined in `src/lib/chain/constants.ts`:

```
ws://127.0.0.1:9944
ws://202.140.140.202:9944
```

The app includes automatic peer discovery and node health monitoring with failover.

## License

Private
