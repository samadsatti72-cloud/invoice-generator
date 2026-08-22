# Invoice Studio

A bilingual (English / Arabic) browser-based invoice and quotation generator.

## Features

- Agency profile with reusable letterhead details.
- Auto-numbered invoices and quotations (with cross-tab/session-safe counters).
- VAT/currency configuration and per-line tax/discount support.
- Invoice history with backup/import/export options.
- Item CSV import/export workflow.
- Email invoice workflow for sharing generated documents.
- Print/PDF generation and ZATCA QR code support.

## Storage model

- App settings, history metadata, language, and counters are stored in browser `localStorage`.
- Logo image data is stored in IndexedDB (via `idb-keyval`) and referenced by `logoKey` in settings.
- Data is browser/device-local unless exported and imported manually.

## Developer setup

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build production bundle:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Tests:

- There is currently no dedicated automated test script in this repository.

## Key dependencies

- `react`, `react-dom`
- `vite`
- `html2pdf.js`
- `qrcode`
- `idb-keyval`
