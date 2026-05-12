# Soil Data

SQLite and React app for tracking garden soil moisture from an Ecowitt device.

## Stack

- Node.js backend with `express`
- SQLite via `better-sqlite3`
- React dashboard bundled with `vite`
- Line charting with `recharts`
- `pnpm` with `minimumReleaseAge: 20160` to avoid very new package releases

## Local development

Use Node `20.19+` or `22.12+`.

1. Copy `.env.example` to `.env` and fill in the Ecowitt values.
2. Install `pnpm` with `npm install -g pnpm@10.19.0`.
3. Install dependencies with `pnpm install`.
4. Start the backend with `pnpm dev:server`.
5. In a second shell, start the frontend with `pnpm dev:client`.

The backend serves API routes on `http://localhost:3000`. The production build is served by the backend after `pnpm build`.

## Proxmox deployment

The installer is designed to be run as a standalone script from a public GitHub raw URL. It will prompt for:

- Proxmox container settings
- Ecowitt application key
- Ecowitt API key
- Ecowitt MAC address
- optional sensor path and poll interval

Typical usage from the Proxmox host:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/MrGrinst/soil-data/main/deploy/proxmox/install-lxc.sh)
```
