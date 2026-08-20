// Builds the base64 TLV payload ZATCA (Saudi tax authority) expects encoded
// into the QR code on a simplified tax invoice, then renders it as a QR PNG.
import QRCode from 'qrcode';

function tlvField(tag, value) {
  const valueBytes = new TextEncoder().encode(value ?? '');
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
