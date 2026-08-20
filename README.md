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
