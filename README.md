<<<<<<< HEAD
# Invoice Studio — Setup & Deployment Guide (Zero to 100%)

A bilingual (English / Arabic) ZATCA-style VAT invoice generator, packaged
as a licensed desktop app (Windows / macOS / Linux) via
[Tauri](https://tauri.app), with yearly subscriptions sold through
[LemonSqueezy](https://lemonsqueezy.com).

This guide assumes **zero prior setup** on your machine and walks all the
way through to a signed, sellable installer. Skip sections you've already
done.

---

## Table of contents

1. [What you're building](#1-what-youre-building)
2. [Install the prerequisites](#2-install-the-prerequisites)
3. [Get the project running](#3-get-the-project-running)
4. [Project structure](#4-project-structure)
5. [Set up licensing (LemonSqueezy)](#5-set-up-licensing-lemonsqueezy)
6. [Configure the app before shipping](#6-configure-the-app-before-shipping)
7. [Run it as a native desktop app](#7-run-it-as-a-native-desktop-app)
8. [Build installers](#8-build-installers)
9. [Code signing](#9-code-signing)
10. [Distributing & updates](#10-distributing--updates)
11. [Backups — how they work](#11-backups--how-they-work)
12. [Troubleshooting](#12-troubleshooting)
13. [Customizing](#13-customizing)

---

## 1. What you're building

- A React app (`src/`) that IS the invoice tool — letterhead setup, line
  items, VAT calculation, ZATCA QR code, bilingual EN/AR with full RTL
  layout, invoice history with gapless sequential numbering.
- Wrapped by **Tauri** (`src-tauri/`) into a real installable desktop app
  — a native window, a `.msi`/`.exe` (Windows), `.dmg` (macOS), or
  `.deb`/`.AppImage`/`.rpm` (Linux) installer.
- Gated by a **license key** the customer buys through LemonSqueezy
  (yearly subscription). The app checks the key on launch and periodically
  after, works offline for up to 14 days on a cached result, and — if a
  subscription lapses — blocks creating *new* invoices while leaving every
  previously saved invoice fully viewable/printable/exportable forever.
- Protected against data loss with **automatic local backups** (every save
  writes the full invoice history to disk) plus a manual **Export All**
  (JSON/CSV) button.

You do **not** need to run a server of your own for any of this. Licensing
is handled entirely by LemonSqueezy's public API; backups are local files
on the customer's machine.

---

## 2. Install the prerequisites

You need three things: **Node.js**, **Rust**, and your OS's **Tauri
system dependencies**. Install all three before continuing.

### 2.1 Node.js

Download the current LTS version from https://nodejs.org and install it.
Verify:

```bash
node --version   # should print v18 or newer
npm --version
```

### 2.2 Rust

Tauri's native shell is written in Rust, so the Rust compiler toolchain is
required to actually build the desktop app (it is **not** required just to
run the web version in a browser — see [section 3](#3-get-the-project-running)).

**macOS / Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
Follow the prompts (choose the default installation), then restart your
terminal and verify:
```bash
rustc --version
cargo --version
```

**Windows:**
Download and run the installer from https://rustup.rs. It will also prompt
you to install the "MSVC Build Tools" if you don't already have Visual
Studio — accept that, it's required.

### 2.3 OS-specific Tauri system dependencies

**Windows:**
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  (the Rust installer above usually prompts for this automatically)
- WebView2 — already preinstalled on Windows 10/11; if missing, Tauri will
  tell you and link the installer.

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```
(Other distros: see https://v2.tauri.app/start/prerequisites/ for the
equivalent package names.)

### 2.4 Confirm everything is in place

```bash
node --version
npm --version
rustc --version
cargo --version
```

If all four print a version number, you're ready for section 3.

---

## 3. Get the project running

1. Unzip this project anywhere, then open a terminal in that folder.
2. Install JS dependencies:
   ```bash
   npm install
   ```
3. **Fastest way to check everything works** — run it as a plain browser
   app first (no Rust/Tauri involved yet):
   ```bash
   npm run dev
   ```
   Open the printed URL (usually http://localhost:5173). You should see
   the invoice editor. This mode is enough for any UI/logic changes — the
   license check works here too (against LemonSqueezy's real API), and
   exports fall back to a normal browser download since there's no desktop
   shell to hand a native Save dialog to.
4. Confirm the production build compiles cleanly:
   ```bash
   npm run build
   ```
   This should finish with no errors and produce a `dist/` folder.

If steps 3–4 work, your environment is healthy and you're ready to build
the actual desktop app in section 7.

---

## 4. Project structure

```
invoice-generator/
├── README.md                    ← this file
├── package.json                 ← npm scripts & JS dependencies
├── vite.config.js               ← frontend build config
├── index.html                   ← app entry point (browser mode)
├── .oxlintrc.json                ← linter config
│
├── public/
│   └── favicon.svg              ← app icon source (also used for the
│                                    desktop app's icon set)
│
├── src/                          ← the actual application (React)
│   ├── main.jsx                  ← React entry point
│   ├── App.jsx                   ← main UI, invoice logic, license gating
│   ├── App.css                   ← all styling
│   ├── index.css                 ← CSS variables, fonts, base styles
│   ├── labels.js                  ← English + Arabic text strings
│   ├── zatca.js                  ← ZATCA-style QR code generation
│   ├── license.js                ← LemonSqueezy activation/validation,
│   │                                 offline grace period logic
│   └── backup.js                 ← auto-backup + manual JSON/CSV export
│
└── src-tauri/                    ← desktop app wrapper (only needed for
    │                                 the installable build, not for
    │                                 `npm run dev`)
    ├── Cargo.toml                 ← Rust dependencies (Tauri + plugins)
    ├── build.rs                   ← Tauri build script
    ├── tauri.conf.json            ← app identity, window size, CSP,
    │                                  bundle/icon config
    ├── capabilities/
    │   └── default.json           ← permission scoping (filesystem,
    │                                  dialog, store access)
    ├── icons/                     ← full icon set (ico/icns/png) for
    │                                  every platform, generated from
    │                                  public/favicon.svg
    └── src/
        ├── main.rs                ← native entry point
        └── lib.rs                 ← plugin registration (fs, dialog,
                                        store, log)
```

---

## 5. Set up licensing (LemonSqueezy)

No backend server of your own is required — LemonSqueezy is the merchant
of record and handles payments, renewals, cancellations, and (importantly
if you're selling from/into Saudi Arabia) VAT compliance on the sale
itself.

### 5.1 Create your store and product

1. Sign up at https://lemonsqueezy.com and create a **Store**.
2. Go to **Products → New Product**. Name it (e.g. "Invoice Studio"), set
   it to a **Subscription**, and create a **Yearly** variant with your
   price.
3. On that variant, open **License Keys** and turn license key generation
   **on**. This makes LemonSqueezy automatically issue a unique key to
   each customer at checkout and manage its `active`/`expired`/`disabled`
   status for you as their subscription renews or lapses — you don't need
   to build or maintain any of that state yourself.
4. (Optional but recommended) Set an **activation limit** per key — e.g.
   `2` — if you want to allow a customer to run the app on a couple of
   their own machines but not share one key across an entire office.

### 5.2 How the app talks to LemonSqueezy

`src/license.js` calls LemonSqueezy's public License API directly from
the app:

- `POST https://api.lemonsqueezy.com/v1/licenses/activate` — called once,
  when the customer first enters their key.
- `POST https://api.lemonsqueezy.com/v1/licenses/validate` — called on
  every launch and whenever the app window regains focus, to check the
  key is still active.

No API secret is embedded in the app — the license key itself is the only
credential involved, and it's exactly what the customer already has.

### 5.3 What happens when a subscription lapses

Nothing you need to do — this is automatic:

1. LemonSqueezy's own billing cycle marks the license key's `status` as
   `expired` once the yearly renewal fails or is cancelled.
2. The next time the app checks (on launch, or when the window regains
   focus), it sees `expired` and locks **new document creation only** —
   the "New Invoice", "Duplicate", and "Convert to Invoice" buttons become
   disabled with a tooltip explaining why, and a banner appears offering
   "Renew subscription" (linking to LemonSqueezy's customer portal) or
   "Enter a different key".
3. **Every invoice already saved remains fully viewable, printable, and
   exportable, permanently, regardless of license state.** This is a
   deliberate design decision — a lapsed subscription should never lock
   someone out of their own past tax records.
4. If the app has no internet access at all, a previously-valid license
   keeps working for **14 days** from the last successful check
   (`OFFLINE_GRACE_PERIOD_DAYS` in `src/license.js`) before locking new
   documents — long enough to cover a normal offline stretch, short enough
   that a cancelled subscription doesn't stay active indefinitely on a
   machine that's never back online.

### 5.4 Selling keys to customers

Send customers to your LemonSqueezy checkout link (Products page → your
variant → "Copy checkout link", or embed LemonSqueezy's hosted checkout on
your own website/landing page). After payment, LemonSqueezy emails them
their license key automatically. They paste it into the app's activation
screen on first launch.

---

## 6. Configure the app before shipping

A few placeholders need to become your own values before you distribute
this to real customers.

### 6.1 App identifier

Open `src-tauri/tauri.conf.json` and change:
```json
"identifier": "com.invoicestudio.app",
```
to your own reverse-domain ID, e.g. `com.yourcompany.invoicestudio`. This
is how the OS identifies the app (app data folder location, updater
consistency, macOS bundle ID) — pick it once and don't change it later, or
existing installs will treat an update as a totally different app.

### 6.2 Product name / window title

Also in `tauri.conf.json`:
```json
"productName": "Invoice Studio",
...
"windows": [{ "title": "Invoice Studio", ... }]
```
Change both if you're renaming the product.

### 6.3 App icon (optional)

The icon set in `src-tauri/icons/` was generated from `public/favicon.svg`
using Tauri's own icon tool. If you want a different icon:

1. Replace `public/favicon.svg` with your new design (or prepare a
   1024×1024 PNG directly).
2. Regenerate the full icon set:
   ```bash
   npx tauri icon path/to/your-icon.png
   ```
   This overwrites everything in `src-tauri/icons/` with correctly-sized
   `.ico` (Windows), `.icns` (macOS), and `.png` (Linux/misc) files.

### 6.4 Version number

Bump `"version"` in both `package.json` and `src-tauri/tauri.conf.json`
before each release (keep them in sync).

---

## 7. Run it as a native desktop app

Once Rust and the system dependencies from section 2 are installed:

```bash
npm run tauri dev
```

This opens the app in a real native window (not a browser tab), with hot
reload for your React changes. The **first run will take a few minutes**
— it's compiling the Rust side from scratch. Subsequent runs are fast.

> **If you hit a permission error** (something like `"fs.writeTextFile
> not allowed"` or similar), open `src-tauri/capabilities/default.json`
> and add the exact permission identifier named in the error message. This
> project ships with fs/dialog/store permissions already scoped for
> backups and license storage, but Tauri's permission system is strict by
> design — if you add new functionality that touches the filesystem,
> dialogs, or other native APIs, you'll need to grant it explicitly the
> same way. This is normal, expected Tauri behavior, not a sign of a
> broken setup.

While `tauri dev` is running, test the full flow once:
1. Enter a real LemonSqueezy license key (or a test one from your store in
   test mode) on the activation screen.
2. Create and save an invoice.
3. Check Settings → Backups & Export shows a real folder path, and that
   "Export All" opens a native Save dialog.

---

## 8. Build installers

```bash
npm run tauri build
```

This produces a real, installable package for **whatever OS you run the
command on** — Tauri does not cross-compile installers by default (a
GitHub Actions matrix build, one job per OS, is the standard way to
produce all three from one push; see
https://v2.tauri.app/distribute/pipelines/github/ if you want to set that
up later).

Output location: `src-tauri/target/release/bundle/`, containing (per OS):

| OS | Files produced |
|---|---|
| Windows | `.msi` and/or `.exe` (NSIS) installer |
| macOS | `.app` bundle and `.dmg` disk image |
| Linux | `.deb`, `.AppImage`, and/or `.rpm` (varies by distro tooling installed) |

The first build takes several minutes (full Rust compile); later builds
are faster.

---

## 9. Code signing

Do this before a real public release — skip it only for early beta
testers you can personally walk through the one-time OS warning.

Unsigned installers trigger scary-looking OS warnings ("Windows protected
your PC", "app is from an unidentified developer" on macOS) that will make
non-technical customers assume the app is malware and abandon the install.

### Windows (~$200–400/year)

1. Buy a code-signing certificate from a Certificate Authority (DigiCert,
   SSL.com, Sectigo, etc.) — an "OV" (Organization Validation) cert is the
   standard, cheaper option; "EV" certs cost more but build trust with
   Windows SmartScreen faster.
2. Once you have the certificate installed on your signing machine (or a
   thumbprint from a cloud HSM-based signer), configure it in
   `tauri.conf.json`:
   ```json
   "bundle": {
     "windows": {
       "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
       "digestAlgorithm": "sha256",
       "timestampUrl": "http://timestamp.digicert.com"
     }
   }
   ```
3. Full walkthrough: https://v2.tauri.app/distribute/sign/windows/

### macOS ($99/year Apple Developer account)

1. Enroll at https://developer.apple.com/programs/.
2. Create a "Developer ID Application" certificate in Xcode or the Apple
   Developer portal.
3. Tauri handles codesigning + notarization via environment variables
   (`APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_PASSWORD`, etc.) during
   `tauri build`.
4. Full walkthrough: https://v2.tauri.app/distribute/sign/macos/

### Linux

No OS-level gatekeeper exists the way Windows/macOS have one —
`.deb`/`.AppImage`/`.rpm` installers work unsigned. (You can still GPG-sign
packages for a proper apt/yum repo if you set one up later, but it's not
required for people to install the file directly.)

---

## 10. Distributing & updates

For v1, the simplest distribution is: host the installer files somewhere
(your website, a GitHub Release, a cloud storage bucket) and link to them
after purchase, alongside the LemonSqueezy checkout.

When you have a new version to ship, customers currently need to
re-download and reinstall manually. If/when that becomes a real burden,
Tauri has a built-in updater plugin (`@tauri-apps/plugin-updater`) that
can check a JSON manifest you host and prompt in-app — deliberately left
out of this initial build to keep the moving parts minimal for a v1
launch; add it once you have real customers and a release cadence worth
automating.

---

## 11. Backups — how they work

Two independent, automatic-by-default safety nets (see `src/backup.js`):

- **Automatic, silent**: after every invoice save, the complete history is
  written to `<app data folder>/backups/history-latest.json`, plus one
  dated snapshot per day (`history-YYYY-MM-DD.json`), with anything older
  than 60 days automatically pruned. No customer action required — this
  can't be forgotten or skipped.
  - Windows: `%APPDATA%\com.yourcompany.invoicestudio\backups\`
  - macOS: `~/Library/Application Support/com.yourcompany.invoicestudio/backups/`
  - Linux: `~/.local/share/com.yourcompany.invoicestudio/backups/`
  - (The exact folder name matches whatever `identifier` you set in
    section 6.1, and is also shown directly in-app under Settings.)
- **Manual, on-demand**: the "Export All" button in Settings lets the
  customer save a JSON (full fidelity, every line item) or CSV
  (one row per invoice, for opening in Excel/Sheets) copy wherever they
  choose — a USB drive, a synced cloud folder, anywhere.

---

## 12. Troubleshooting

**`npm run tauri dev` fails immediately with a Rust/cargo error**
Rust likely isn't installed or isn't on your `PATH`. Re-run
`rustc --version` in a fresh terminal — if that fails, redo section 2.2 and
make sure you restarted your terminal afterward (rustup modifies your
shell profile, which only takes effect in new terminal sessions).

**A permission-denied error mentioning `fs`, `dialog`, or `store`**
See the note at the end of section 7 — add the named permission identifier
to `src-tauri/capabilities/default.json`.

**Windows build fails looking for "link.exe" or similar**
The MSVC Build Tools aren't installed. Re-run the Rust installer from
https://rustup.rs and accept the Visual Studio Build Tools prompt, or
install them separately from
https://visualstudio.microsoft.com/visual-cpp-build-tools/.

**Linux build fails looking for `webkit2gtk` or similar `.pc` files**
A system dependency from section 2.3 is missing — re-run the `apt install`
command (or find your distro's equivalent package names at
https://v2.tauri.app/start/prerequisites/).

**License activation says "Could not reach the license server"**
The machine has no internet access, or a firewall/proxy is blocking
`api.lemonsqueezy.com`. The app's Content Security Policy
(`tauri.conf.json` → `app.security.csp`) already explicitly allows this
domain — if you've customized the CSP, make sure that allowance is still
present.

**A customer says their invoices "disappeared"**
Point them to the automatic backup folder (section 11) — the dated
snapshots there let you recover any prior state even if the in-app history
was somehow cleared.

---

## 13. Customizing

- **Colors, fonts**: CSS variables at the top of `src/index.css`; general
  styling in `src/App.css`.
- **Text (English/Arabic)**: `src/labels.js`.
- **Invoice logic** (calculations, QR code, history, numbering):
  `src/App.jsx` and `src/zatca.js`.
- **License behavior** (grace period length, lock rules): `src/license.js`
  and the `canCommitNewDocument` logic in `src/App.jsx`.
- **Backup behavior** (retention period, file naming): `src/backup.js`.
=======
# Invoice Studio

A bilingual (English / Arabic) VAT invoice generator built for a Saudi
graphic-design agency. Runs entirely in the browser — no backend, no
database, no monthly cost.

## What it does

- Save your agency's letterhead once (name in EN + AR, logo, address, VAT
  number, C.R. number, phone, email) — it's stored in the browser and
  reused on every invoice.
- Add the buyer's name, invoice number (auto-numbered, editable), date, and
  as many line items (description / qty / unit price) as needed.
- Subtotal, 15% VAT, and the total are calculated automatically.
- Toggle the whole invoice between English and Arabic (full right-to-left
  layout) with one click.
- Generates a ZATCA-compliant QR code (the encoded seller name, VAT number,
  timestamp, total, and VAT amount required on Saudi simplified tax
  invoices).
- "Print / Save PDF" opens the browser's print dialog with a clean,
  letterhead-only layout — choose "Save as PDF" as the printer to get a PDF,
  or print directly.
- Every printed invoice is saved to a local History list, so old invoices
  and invoice numbers aren't lost.

## Where the data lives

Everything (agency details, invoice history, invoice counter) is saved in
the browser's local storage on whichever device/browser is used — there is
no server and nothing is sent anywhere. That means:

- It's free to run and needs no login.
- History is per-browser. If your father uses the same browser on the same
  computer every time, everything will be there next time. If he opens it
  on a different browser or device, it'll start fresh (agency details will
  need to be entered once on that device too).
- Clearing browser data/cache will erase the saved invoices and settings.

If down the road you want the data shared across devices or backed up
centrally, that would need a small database added — happy to help with that
later if it becomes useful.

## Running it locally

```bash
npm install
npm run dev
```

Then open the URL it prints (usually http://localhost:5173).

## Deploying to Vercel (so your father can use it from a real web link)

The easiest path — no command line needed after the first step:

1. **Put this project on GitHub.**
   - Create a new repository at github.com (e.g. `invoice-studio`).
   - Upload this whole `invoice-app` folder to it (GitHub's web uploader
     works fine, or `git push` if you're comfortable with git).

2. **Import it on Vercel.**
   - Go to vercel.com and sign up / log in (free "Hobby" plan is enough).
   - Click **Add New → Project**, then **Import** the GitHub repo you just
     created.
   - Vercel auto-detects this as a Vite app — leave the default build
     settings (`npm run build`, output directory `dist`) and click
     **Deploy**.
   - After a minute you'll get a live URL like
     `https://invoice-studio.vercel.app`. That's the link your father can
     bookmark and use from any browser.

3. **Updating it later.** Any time you push changes to the GitHub repo,
   Vercel rebuilds and redeploys automatically — nothing else to do.

Alternatively, if you're comfortable with a terminal, you can skip GitHub
and deploy directly:

```bash
npm install -g vercel
vercel login
vercel --prod
```

Follow the prompts (accept the defaults) and it will give you the same kind
of live link.

## Customizing

- Colors, fonts: `src/index.css` (variables at the top) and `src/App.css`.
- Text labels (English/Arabic): `src/labels.js`.
- Logic (calculations, QR code, history): `src/App.jsx` and `src/zatca.js`.
>>>>>>> ec52f3791aabd92e9b01cdb02e64ebb2e73c5e34
