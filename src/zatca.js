// Builds the base64 TLV payload ZATCA (Saudi tax authority) expects encoded
// into the QR code on a simplified tax invoice, then renders it as a QR PNG.
import QRCode from 'qrcode';

// ZATCA's TLV format stores each field's byte-length in a single byte
// (0-255). Encoding a value longer than that would silently wrap around
// (e.g. a 260-byte value would write a length of 4), producing a QR code
// that decodes to garbage without any error ever being raised. Truncate at
// a UTF-8 character boundary — never mid-codepoint — so long agency names
// or addresses degrade to a shorter-but-valid payload instead of a
// corrupt one.
function truncateToUtf8Bytes(value, maxBytes) {
  let bytes = new TextEncoder().encode(value);
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  // Back off until we're not sitting in the middle of a multi-byte
  // UTF-8 sequence (continuation bytes have the top two bits `10`).
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(bytes.slice(0, end));
}

function tlvField(tag, value) {
  const safeValue = truncateToUtf8Bytes(value ?? '', 255);
  const valueBytes = new TextEncoder().encode(safeValue);
  const out = new Uint8Array(2 + valueBytes.length);
  out[0] = tag;
  out[1] = valueBytes.length;
  out.set(valueBytes, 2);
  return out;
}

function buildTlvBase64({ sellerName, vatNumber, timestamp, total, vatTotal }) {
  const fields = [
    tlvField(1, sellerName || ''),
    tlvField(2, vatNumber || ''),
    tlvField(3, timestamp),
    tlvField(4, Number(total).toFixed(2)),
    tlvField(5, Number(vatTotal).toFixed(2)),
  ];
  const length = fields.reduce((sum, f) => sum + f.length, 0);
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const f of fields) {
    combined.set(f, offset);
    offset += f.length;
  }
  let binary = '';
  combined.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export async function generateZatcaQrDataUrl({ sellerName, vatNumber, isoTimestamp, total, vatTotal }) {
  if (!sellerName || !vatNumber) return null;
  const payload = buildTlvBase64({ sellerName, vatNumber, timestamp: isoTimestamp, total, vatTotal });
  try {
    return await QRCode.toDataURL(payload, {
      margin: 0,
      width: 168,
      color: { dark: '#1F2A24', light: '#00000000' },
    });
  } catch {
    return null;
  }
}