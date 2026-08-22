import { loadJSON, saveJSON } from './storage';

const COUNTER_KEY = 'invoiceapp.counter';
const QUOTE_COUNTER_KEY = 'invoiceapp.quoteCounter';
const LOCK_SUFFIX = '.lock';
const LOCK_TTL_MS = 1200;
const LOCK_RETRY_COUNT = 12;
const LOCK_RETRY_WAIT_MS = 8;
const CHANNEL_NAME = 'invoiceapp.counter.channel.v1';

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;

function keyFor(type) {
  return type === 'quotation' ? QUOTE_COUNTER_KEY : COUNTER_KEY;
}

function prefixFor(type) {
  return type === 'quotation' ? 'QUO' : 'INV';
}

function formatDocNumber(type, n) {
  return `${prefixFor(type)}-${String(n).padStart(4, '0')}`;
}

function readCounter(type) {
  const value = Number(loadJSON(keyFor(type), 0));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function hold(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // Intentional tiny spin-wait so lock attempts stay synchronous.
  }
}

function acquireLock(type) {
  const lockKey = `${keyFor(type)}${LOCK_SUFFIX}`;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt += 1) {
    const now = Date.now();
    let owner = null;
    try {
      owner = JSON.parse(localStorage.getItem(lockKey) || 'null');
    } catch {
      owner = null;
    }
    if (!owner || owner.expiresAt <= now) {
      try {
        localStorage.setItem(lockKey, JSON.stringify({ token, expiresAt: now + LOCK_TTL_MS }));
        const verify = JSON.parse(localStorage.getItem(lockKey) || 'null');
        if (verify?.token === token) return { lockKey, token };
      } catch {
        return null;
      }
    }
    hold(LOCK_RETRY_WAIT_MS);
  }
  return null;
}

function releaseLock(lock) {
  if (!lock) return;
  try {
    const owner = JSON.parse(localStorage.getItem(lock.lockKey) || 'null');
    if (owner?.token === lock.token) localStorage.removeItem(lock.lockKey);
  } catch {
    // Ignore lock cleanup failures.
  }
}

function announceCommit(type, value) {
  if (!channel) return;
  channel.postMessage({ type: 'commit', docType: type, value });
}

function syncFromBroadcast(message) {
  if (!message || message.type !== 'commit') return;
  const storageKey = keyFor(message.docType);
  const incoming = Number(message.value);
  if (!Number.isFinite(incoming) || incoming <= 0) return;
  const current = readCounter(message.docType);
  if (incoming > current) saveJSON(storageKey, incoming);
}

if (channel) channel.onmessage = (event) => syncFromBroadcast(event.data);

export function peekNext(type) {
  return formatDocNumber(type, readCounter(type) + 1);
}

export function commitNext(type) {
  const lock = acquireLock(type);
  const next = readCounter(type) + 1;
  saveJSON(keyFor(type), next);
  releaseLock(lock);
  announceCommit(type, next);
  return formatDocNumber(type, next);
}
