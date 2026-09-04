// Local backup & export for invoice history.
//
// Why this exists: invoice history lives in a single JSON blob (see
// HISTORY_KEY in App.jsx). That's fine until the machine's disk dies, the
// app data gets wiped by an OS reinstall, or (in the old browser-only
// version of this app) someone clears their browser data — and for a tax
// record, "sorry, it's gone" is not an acceptable failure mode. This module
// gives two independent safety nets:
//   1. autoBackup() — runs silently after every invoice save, writing the
//      full history to disk under the app's own data folder. No user
//      action required, so it can't be forgotten.
//   2. exportHistory() — a manual "Export All" the user triggers from
//      Settings, saving JSON (full fidelity, re-importable) or CSV
//      (opens in Excel/Sheets for bookkeeping) wherever they choose.
//
// Both are best-effort: a backup failure must never block the person from
// actually saving/printing/downloading their invoice, so every disk
// operation here is wrapped and swallowed with a console warning rather
// than thrown.

const AUTO_BACKUP_DIR = 'backups';
const AUTO_BACKUP_KEEP_DAYS = 60;

function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// --- Format conversion ---------------------------------------------------

export function historyToJson(history) {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), format: 'invoice-studio-backup-v1', history },
    null,
    2
  );
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  // Quote any field containing a comma, quote, or newline; double up
  // internal quotes per RFC 4180.
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// One row per saved document — enough for bookkeeping/reconciliation, not
// a line-item-level export (the JSON export carries full fidelity,
// including every line item, for anyone who needs that).
export function historyToCsv(history) {
  const columns = [
    'invoiceNumber',
    'docType',
    'date',
    'dueDate',
    'buyerName',
    'buyerVat',
    'buyerCr',
    'total',
    'paymentType',
    'amountPaid',
    'balanceDue',
    'savedAt',
  ];
  const rows = [columns.join(',')];
  for (const h of history) {
    rows.push(columns.map((c) => csvEscape(h[c])).join(','));
  }
  return rows.join('\r\n');
}

// --- Manual export (user-triggered, picks a save location) --------------

async function downloadInBrowser(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Exports the full history as JSON or CSV. In the desktop app this opens a
// native "Save As" dialog so the person picks exactly where it goes (their
// Documents folder, a USB drive, a synced cloud folder, etc). In a plain
// browser it falls back to a normal file download.
export async function exportHistory(history, format = 'json') {
  const isCsv = format === 'csv';
  const content = isCsv ? historyToCsv(history) : historyToJson(history);
  const filename = `invoice-backup-${todayStamp()}.${isCsv ? 'csv' : 'json'}`;
  const mimeType = isCsv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({
      defaultPath: filename,
      filters: [{ name: isCsv ? 'CSV' : 'JSON', extensions: [isCsv ? 'csv' : 'json'] }],
    });
    if (!path) return { saved: false, cancelled: true }; // user cancelled the dialog
    await writeTextFile(path, content);
    return { saved: true, path };
  }

  await downloadInBrowser(filename, content, mimeType);
  return { saved: true, path: filename };
}

// --- Automatic silent backup (desktop app only) --------------------------

// Called after every successful invoice save. No-ops outside Tauri (a
// browser tab can't write to disk without a user gesture, so there's
// nothing safe to do there — the manual export above is the browser-mode
// safety net).
export async function autoBackup(history) {
  if (!isTauri()) return { attempted: false };
  try {
    const { writeTextFile, mkdir, readDir, remove, exists } = await import('@tauri-apps/plugin-fs');
    const { BaseDirectory } = await import('@tauri-apps/plugin-fs');

    if (!(await exists(AUTO_BACKUP_DIR, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(AUTO_BACKUP_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    }

    const content = historyToJson(history);
    // Always-current snapshot, cheap to restore from without hunting
    // through dated files.
    await writeTextFile(`${AUTO_BACKUP_DIR}/history-latest.json`, content, {
      baseDir: BaseDirectory.AppData,
    });
    // One dated snapshot per day (repeated saves on the same day just
    // overwrite that day's file), so a person can recover "what my
    // invoices looked like two weeks ago" without unbounded disk growth.
    await writeTextFile(`${AUTO_BACKUP_DIR}/history-${todayStamp()}.json`, content, {
      baseDir: BaseDirectory.AppData,
    });

    await pruneOldBackups({ readDir, remove, BaseDirectory });
    return { attempted: true, ok: true };
  } catch (err) {
    console.error('Auto-backup failed (invoice was still saved normally)', err);
    return { attempted: true, ok: false, error: String(err) };
  }
}

async function pruneOldBackups({ readDir, remove, BaseDirectory }) {
  const entries = await readDir(AUTO_BACKUP_DIR, { baseDir: BaseDirectory.AppData });
  const cutoff = Date.now() - AUTO_BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000;
  const dated = /^history-(\d{4}-\d{2}-\d{2})\.json$/;
  for (const entry of entries) {
    const match = entry.name?.match(dated);
    if (!match) continue; // never touch history-latest.json or anything unexpected
    const fileDate = new Date(match[1]).getTime();
    if (Number.isFinite(fileDate) && fileDate < cutoff) {
      await remove(`${AUTO_BACKUP_DIR}/${entry.name}`, { baseDir: BaseDirectory.AppData }).catch(() => {});
    }
  }
}

// Where the auto-backups live, for display in Settings ("backups saved to
// ..."). Returns null outside Tauri.
export async function getBackupFolderPath() {
  if (!isTauri()) return null;
  try {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    return await join(await appDataDir(), AUTO_BACKUP_DIR);
  } catch {
    return null;
  }
}
