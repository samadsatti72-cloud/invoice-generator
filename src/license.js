// License gating against LemonSqueezy's License API.
// Docs: https://docs.lemonsqueezy.com/api/license-api
//
// This module talks directly to https://api.lemonsqueezy.com from the
// desktop app — no backend of ours is involved. LemonSqueezy is the
// merchant of record: it owns the subscription, renewal, dunning, and
// (for a Saudi customer) VAT handling. All we do here is ask "is this key
// currently valid" and cache the answer for offline use.
//
// Product/store IDs are NOT required for validate/activate calls — the
// license key itself is the credential (see the "public API" gotcha in
// LemonSqueezy's docs). No secret API key is embedded in the app.

const LEMONSQUEEZY_BASE = 'https://api.lemonsqueezy.com/v1/licenses';

// How long a previously-valid license keeps working without a successful
// network check. Long enough to cover a customer working offline for a
// week or two; short enough that a cancelled subscription doesn't stay
// "active" indefinitely on a machine that's never online.
export const OFFLINE_GRACE_PERIOD_DAYS = 14;

const STORAGE_KEY = 'invoiceapp.license';
const INSTANCE_NAME_KEY = 'invoiceapp.instanceName';

// --- Storage -----------------------------------------------------------
// Prefers Tauri's persistent Store plugin when running inside the desktop
// shell (survives app updates/reinstalls better than the webview's
// localStorage, which some OSes treat as clearable browser cache). Falls
// back to localStorage so the same module works in a plain browser during
// development.
//
// NOTE: wiring in @tauri-apps/plugin-store is the one piece that needs the
// Rust side compiled (see src-tauri/) — until then this transparently runs
// on localStorage, which is fine for `npm run dev`.
let tauriStorePromise = null;
async function getTauriStore() {
  if (typeof window === 'undefined' || !window.__TAURI__) return null;
  if (!tauriStorePromise) {
    tauriStorePromise = import('@tauri-apps/plugin-store')
      .then((mod) => mod.load('license.json', { autoSave: true }))
      .catch(() => null);
  }
  return tauriStorePromise;
}

async function readState() {
  const store = await getTauriStore();
  if (store) {
    const value = await store.get(STORAGE_KEY);
    return value ?? null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeState(state) {
  const store = await getTauriStore();
  if (store) {
    await store.set(STORAGE_KEY, state);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not persist license state', err);
  }
}

// A stable per-install identifier, sent to LemonSqueezy as `instance_name`
// on activation so each install shows up distinctly in the dashboard (and
// so activation_limit — e.g. "2 machines per subscription" — is enforced
// meaningfully). Not tied to hardware, just generated once and kept.
function getOrCreateInstanceName() {
  try {
    let name = localStorage.getItem(INSTANCE_NAME_KEY);
    if (!name) {
      name = `install-${crypto.randomUUID()}`;
      localStorage.setItem(INSTANCE_NAME_KEY, name);
    }
    return name;
  } catch {
    return `install-${Date.now()}`;
  }
}

// --- LemonSqueezy API calls ---------------------------------------------

async function callLicenseApi(path, params) {
  const res = await fetch(`${LEMONSQUEEZY_BASE}/${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => ({}));
  // LemonSqueezy returns 4xx with a JSON `error` field for invalid/expired
  // keys — that's a normal outcome for us, not a thrown exception. Only
  // network failures (fetch rejecting) should throw.
  return body;
}

// Activates a fresh license key against this install and stores the
// resulting instance_id, which subsequent validate calls use to check
// *this specific install*, not just the key in the abstract.
export async function activateLicense(licenseKey) {
  const trimmedKey = licenseKey.trim();
  if (!trimmedKey) return { valid: false, error: 'Enter a license key.' };

  // LemonSqueezy's activate endpoint has no "already activated, skip it"
  // behavior of its own — calling it again for a device that's already
  // activated still creates a brand-new instance and permanently consumes
  // another seat from the key's activation limit. Without this guard,
  // something as ordinary as relaunching the app before its local state
  // finishes persisting, or a person clicking Activate twice, silently
  // burns through a real customer's device limit for what is, in reality,
  // the same single device. If this exact key is already activated and
  // stored locally with a real instance_id, treat re-submitting it as a
  // no-op success instead of calling the network again.
  const existing = await readState();
  if (existing?.key === trimmedKey && existing?.instanceId) {
    return { valid: true, state: existing, alreadyActivated: true };
  }

  const instanceName = getOrCreateInstanceName();
  let body;
  try {
    body = await callLicenseApi('activate', {
      license_key: trimmedKey,
      instance_name: instanceName,
    });
  } catch {
    return { valid: false, error: 'offline', networkError: true };
  }

  // LemonSqueezy's /activate endpoint responds with a top-level
  // "activated" boolean, NOT "valid" — confirmed from a real captured
  // response, not documentation. This was the actual bug behind this
  // entire debugging saga: every activation was succeeding server-side
  // (which is exactly why the dashboard kept showing real successful
  // activations) while this code checked a field name that endpoint never
  // sends, so `body.valid` was always `undefined` and every single
  // success was misread as a failure. Checking both names, preferring the
  // one actually confirmed live, means this exact class of mistake can't
  // silently recur if a future API response shape shifts slightly either.
  const activated = body.activated ?? body.valid;
  if (!activated) {
    return { valid: false, error: body.error || 'Invalid license key.' };
  }

  const state = {
    key: trimmedKey,
    instanceId: body.instance?.id ?? null,
    status: body.license_key?.status ?? 'active',
    expiresAt: body.license_key?.expires_at ?? null,
    customerEmail: body.meta?.customer_email ?? null,
    productName: body.meta?.product_name ?? null,
    lastCheckedAt: new Date().toISOString(),
    lastValidAt: new Date().toISOString(),
  };
  await writeState(state);
  return { valid: true, state };
}

// Re-checks the currently-stored key/instance against LemonSqueezy. Updates
// the cache on success. On network failure, leaves the cache untouched and
// signals the caller to fall back to the offline grace-period logic in
// getLicenseStatus() instead of treating this as invalid.
export async function revalidateLicense() {
  const stored = await readState();
  if (!stored?.key) return { valid: false, error: 'not-activated' };

  let body;
  try {
    body = await callLicenseApi('validate', {
      license_key: stored.key,
      ...(stored.instanceId ? { instance_id: stored.instanceId } : {}),
    });
  } catch {
    // Network unreachable — don't touch lastCheckedAt/lastValidAt; the
    // offline grace period in getLicenseStatus() decides what happens.
    return { valid: null, error: 'offline', networkError: true };
  }

  // Same defensive both-names check as activateLicense() above — the
  // /activate endpoint turned out to use "activated" instead of the
  // documented "valid", so this endpoint's exact field name is no longer
  // trusted on documentation alone either.
  const isValid = body.valid ?? body.activated;
  const now = new Date().toISOString();
  const next = {
    ...stored,
    status: body.license_key?.status ?? (isValid ? 'active' : 'invalid'),
    expiresAt: body.license_key?.expires_at ?? stored.expiresAt,
    lastCheckedAt: now,
    lastValidAt: isValid ? now : stored.lastValidAt,
  };
  await writeState(next);
  return { valid: !!isValid, error: body.error ?? null, state: next };
}

export async function clearLicense() {
  await writeState(null);
}

export async function getStoredLicense() {
  return readState();
}

// Derives the app's current lock/unlock decision from cached state. This
// is what the UI actually reads — it never calls the network itself, so it
// works instantly and offline. Call revalidateLicense() separately (e.g.
// on launch, and periodically) to keep the cache fresh.
export async function getLicenseStatus() {
  const stored = await readState();
  if (!stored?.key) {
    return { activated: false, locked: true, reason: 'not-activated' };
  }

  if (stored.status === 'disabled') {
    return { activated: true, locked: true, reason: 'disabled', state: stored };
  }

  const now = Date.now();
  const lastValidAt = stored.lastValidAt ? new Date(stored.lastValidAt).getTime() : 0;
  const withinGracePeriod = now - lastValidAt <= OFFLINE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

  if (stored.status === 'active' && withinGracePeriod) {
    return { activated: true, locked: false, state: stored };
  }

  if (stored.status === 'expired') {
    return { activated: true, locked: true, reason: 'expired', state: stored };
  }

  if (!withinGracePeriod) {
    return { activated: true, locked: true, reason: 'grace-period-elapsed', state: stored };
  }

  return { activated: true, locked: false, state: stored };
}