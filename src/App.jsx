import { useEffect, useMemo, useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';
import { LABELS } from './labels';
import { generateZatcaQrDataUrl } from './zatca';
import './App.css';

const SETTINGS_KEY = 'invoiceapp.agencySettings';
const COUNTER_KEY = 'invoiceapp.counter';
const HISTORY_KEY = 'invoiceapp.history';
const LANG_KEY = 'invoiceapp.language';
const ORGANIZATIONS_KEY = 'invoiceapp.organizations';

const emptyAgency = {
  nameEn: '',
  nameAr: '',
  addressEn: '',
  addressAr: '',
  vatNumber: '',
  crNumber: '',
  phone: '',
  email: '',
  logo: '',
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyItem() {
  return { id: uid(), description: '', qty: 1, unitPrice: 0 };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function nextInvoiceNumber() {
  const n = loadJSON(COUNTER_KEY, 0) + 1;
  localStorage.setItem(COUNTER_KEY, JSON.stringify(n));
  return `INV-${String(n).padStart(4, '0')}`;
}

function formatMoney(n) {
  return (Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function App() {
  const [lang, setLang] = useState(() => loadJSON(LANG_KEY, 'en'));
  const t = LABELS[lang] || {};

  const [agency, setAgency] = useState(() => loadJSON(SETTINGS_KEY, emptyAgency));
  const [settingsOpen, setSettingsOpen] = useState(() => !loadJSON(SETTINGS_KEY, null));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState(() => loadJSON(HISTORY_KEY, []));
  const [savedOrgs, setSavedOrgs] = useState(() => loadJSON(ORGANIZATIONS_KEY, {}));

  const [invoiceNumber, setInvoiceNumber] = useState(() => nextInvoiceNumber());
  const [date, setDate] = useState(() => todayISO());
  const [dueDate, setDueDate] = useState('');
  
  const [buyerName, setBuyerName] = useState('');
  const [buyerVat, setBuyerVat] = useState('');
  const [buyerCr, setBuyerCr] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');

  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(() => [emptyItem()]);
  const [paymentType, setPaymentType] = useState('full');
  const [amountPaid, setAmountPaid] = useState(0);
  const [qrUrl, setQrUrl] = useState(null);
  const [mobileView, setMobileView] = useState('edit');

  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.dir = t.dir || 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem(LANG_KEY, JSON.stringify(lang));
  }, [lang, t.dir]);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0),
    [items]
  );
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  useEffect(() => {
    if (paymentType === 'full') {
      setAmountPaid(total);
    } else if (paymentType === 'half') {
      setAmountPaid(total / 2);
    }
  }, [paymentType, total]);

  const balanceDue = useMemo(() => Math.max(0, total - (Number(amountPaid) || 0)), [total, amountPaid]);

  useEffect(() => {
    const sellerName = lang === 'ar' ? agency.nameAr || agency.nameEn : agency.nameEn || agency.nameAr;
    let cancelled = false;
    generateZatcaQrDataUrl({
      sellerName,
      vatNumber: agency.vatNumber,
      isoTimestamp: new Date(`${date}T12:00:00`).toISOString(),
      total,
      vatTotal: vat,
    }).then((url) => {
      if (!cancelled) setQrUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [agency.nameAr, agency.nameEn, agency.vatNumber, date, total, vat, lang]);

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(id) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  }

  function handleBuyerNameChange(val) {
    setBuyerName(val);
    const matched = savedOrgs[val.trim().toLowerCase()];
    if (matched) {
      if (matched.vat) setBuyerVat(matched.vat);
      if (matched.cr) setBuyerCr(matched.cr);
      if (matched.address) setBuyerAddress(matched.address);
      if (matched.phone) setBuyerPhone(matched.phone);
      if (matched.email) setBuyerEmail(matched.email);
      if (matched.notes) setNotes(matched.notes);
    }
  }

  function rememberOrganization() {
    const key = buyerName.trim().toLowerCase();
    if (!key) return;
    const updated = {
      ...savedOrgs,
      [key]: {
        name: buyerName.trim(),
        vat: buyerVat || '',
        cr: buyerCr || '',
        address: buyerAddress || '',
        phone: buyerPhone || '',
        email: buyerEmail || '',
        notes: notes || '',
      },
    };
    setSavedOrgs(updated);
    localStorage.setItem(ORGANIZATIONS_KEY, JSON.stringify(updated));
  }

  function saveAgency(next) {
    setAgency(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    setSettingsOpen(false);
  }

  function handleLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAgency((a) => ({ ...a, logo: reader.result }));
    reader.readAsDataURL(file);
  }

  function startNewInvoice() {
    setInvoiceNumber(nextInvoiceNumber());
    setDate(todayISO());
    setDueDate('');
    setBuyerName('');
    setBuyerVat('');
    setBuyerCr('');
    setBuyerAddress('');
    setBuyerPhone('');
    setBuyerEmail('');
    setNotes('');
    setPaymentType('full');
    setItems([emptyItem()]);
    setMobileView('edit');
  }

  function saveToHistory() {
    rememberOrganization();
    const entry = {
      id: uid(),
      invoiceNumber,
      date,
      dueDate,
      buyerName,
      buyerVat,
      buyerCr,
      buyerAddress,
      buyerPhone,
      buyerEmail,
      total,
      amountPaid,
      balanceDue,
      items,
      notes,
      lang,
      savedAt: new Date().toISOString(),
    };
    const nextHistory = [entry, ...history.filter((h) => h.invoiceNumber !== invoiceNumber)].slice(0, 200);
    setHistory(nextHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
  }

  function handlePrint() {
    saveToHistory();
    window.print();
  }

  function handleDownloadPdf() {
    saveToHistory();
    const element = document.getElementById('invoice-sheet');
    const opt = {
      margin: 10,
      filename: `${invoiceNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };
    html2pdf().set(opt).from(element).save();
  }

  function loadFromHistory(entry) {
    setInvoiceNumber(entry.invoiceNumber);
    setDate(entry.date);
    setDueDate(entry.dueDate || '');
    setBuyerName(entry.buyerName || '');
    setBuyerVat(entry.buyerVat || '');
    setBuyerCr(entry.buyerCr || '');
    setBuyerAddress(entry.buyerAddress || '');
    setBuyerPhone(entry.buyerPhone || '');
    setBuyerEmail(entry.buyerEmail || '');
    if (entry.items) setItems(entry.items);
    if (entry.notes) setNotes(entry.notes);
    if (entry.amountPaid !== undefined) {
      setAmountPaid(entry.amountPaid);
      setPaymentType(entry.amountPaid === entry.total ? 'full' : 'custom');
    }
    setLang(entry.lang || 'en');
    setHistoryOpen(false);
    setMobileView('preview');
  }

  function deleteHistoryEntry(id) {
    if (!window.confirm(t.confirmDeleteHistory || 'Delete this history item?')) return;
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  const agencyDisplayName = lang === 'ar' ? agency.nameAr || agency.nameEn : agency.nameEn || agency.nameAr;
  const agencyDisplayAddress = lang === 'ar' ? agency.addressAr || agency.addressEn : agency.addressEn || agency.addressAr;
  const orgList = Object.values(savedOrgs);

  return (
    <div className="shell" dir={t.dir || 'ltr'}>
      <header className="topbar no-print">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="22" height="22">
              <rect width="32" height="32" rx="7" fill="#0F6B5C" />
              <path d="M9 8h14v2H9zM9 13h14v2H9zM9 18h9v2H9z" fill="#F6F2E9" />
              <circle cx="23" cy="22" r="4.5" fill="none" stroke="#F6F2E9" strokeWidth="1.6" />
            </svg>
          </span>
          <span className="brand-name">{t.appName || 'Invoice Studio'}</span>
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
            {t.langToggle || 'العربية / English'}
          </button>
          <button className="btn ghost" onClick={() => setHistoryOpen(true)}>
            {t.history || 'History'}
          </button>
          <button className="btn ghost" onClick={() => setSettingsOpen(true)}>
            {t.settings || 'Settings'}
          </button>
          <button className="btn subtle" onClick={startNewInvoice}>
            {t.newInvoice || 'New Invoice'}
          </button>
          <button className="btn ghost" onClick={handlePrint}>
            {t.print || 'Print'}
          </button>
          <button className="btn primary" onClick={handleDownloadPdf}>
            Save as PDF
          </button>
        </div>
      </header>

      <div className="mobile-tabs no-print">
        <button className={mobileView === 'edit' ? 'active' : ''} onClick={() => setMobileView('edit')}>
          {t.editorTitle || 'Edit'}
        </button>
        <button className={mobileView === 'preview' ? 'active' : ''} onClick={() => setMobileView('preview')}>
          {t.previewTitle || 'Preview'}
        </button>
      </div>

      <main className="workspace">
        <section className={`editor no-print ${mobileView === 'edit' ? '' : 'mobile-hidden'}`}>
          <h1 className="section-title">{t.editorTitle || 'Invoice Details'}</h1>

          <div className="field-grid two">
            <label className="field">
              <span>{t.invoiceNumber || 'Invoice No.'}</span>
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </label>
            <label className="field">
              <span>{t.date || 'Date'}</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          <h2 className="section-subtitle">Buyer / Organization Information</h2>
          <div className="field-grid two">
            <label className="field">
              <span>{t.buyerName || 'Organization / Buyer Name'}</span>
              <input
                value={buyerName}
                placeholder={t.buyerNamePh || 'e.g. Al Salam Marketing Co.'}
                onChange={(e) => handleBuyerNameChange(e.target.value)}
                onBlur={rememberOrganization}
                list="saved-organizations"
                autoComplete="off"
              />
              <datalist id="saved-organizations">
                {orgList.map((org) => (
                  <option value={org.name} key={org.name} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>
                {t.buyerVat || 'Buyer VAT Number'} <em className="hint">({t.optional || 'optional'})</em>
              </span>
              <input
                value={buyerVat}
                onChange={(e) => setBuyerVat(e.target.value)}
                onBlur={rememberOrganization}
              />
            </label>
          </div>

          <div className="field-grid two">
            <label className="field">
              <span>CR Number <em className="hint">({t.optional || 'optional'})</em></span>
              <input
                value={buyerCr}
                onChange={(e) => setBuyerCr(e.target.value)}
                onBlur={rememberOrganization}
              />
            </label>
            <label className="field">
              <span>Buyer Address <em className="hint">({t.optional || 'optional'})</em></span>
              <input
                value={buyerAddress}
                onChange={(e) => setBuyerAddress(e.target.value)}
                onBlur={rememberOrganization}
              />
            </label>
          </div>

          <div className="field-grid two">
            <label className="field">
              <span>Mobile / Phone <em className="hint">({t.optional || 'optional'})</em></span>
              <input
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                onBlur={rememberOrganization}
              />
            </label>
            <label className="field">
              <span>Email Address <em className="hint">({t.optional || 'optional'})</em></span>
              <input
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                onBlur={rememberOrganization}
              />
            </label>
          </div>

          <h2 className="section-subtitle">Payment Terms & Split Payments</h2>
          <div className="field-grid two">
            <label className="field">
              <span>Payment Option</span>
              <select className="select-input" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                <option value="full">Paid Full</option>
                <option value="half">Half Payment (50%)</option>
                <option value="custom">Custom Partial Payment</option>
              </select>
            </label>
            <label className="field">
              <span>Due Date for Remaining Balance</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>

          {paymentType !== 'full' && (
            <div className="field-grid two">
              <label className="field">
                <span>Amount Paid</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Remaining Balance</span>
                <input type="text" readOnly value={formatMoney(balanceDue)} disabled />
              </label>
            </div>
          )}

          <h2 className="section-subtitle">{t.description || 'Description'}</h2>
          <div className="items-editor">
            <div className="item-row item-row-head" aria-hidden="true">
              <span>{t.description || 'Description'}</span>
              <span>{t.qty || 'Qty'}</span>
              <span>{t.unitPrice || 'Unit Price'}</span>
              <span>{t.lineTotal || 'Amount'}</span>
              <span />
            </div>
            {items.map((it) => (
              <div className="item-row" key={it.id}>
                <input
                  className="item-desc"
                  placeholder={t.itemDescPh || 'e.g. Logo design & brand guide'}
                  value={it.description}
                  onChange={(e) => updateItem(it.id, { description: e.target.value })}
                />
                <input
                  className="item-qty"
                  type="number"
                  min="0"
                  step="1"
                  value={it.qty}
                  onChange={(e) => updateItem(it.id, { qty: e.target.value })}
                />
                <input
                  className="item-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={it.unitPrice}
                  onChange={(e) => updateItem(it.id, { unitPrice: e.target.value })}
                />
                <span className="item-amount">
                  {formatMoney((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}
                </span>
                <button
                  className="icon-btn danger"
                  onClick={() => removeItem(it.id)}
                  disabled={items.length === 1}
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button className="btn subtle add-line" onClick={addItem} type="button">
            + Add line
          </button>

          <h2 className="section-subtitle">{t.notes || 'Notes'}</h2>
          <textarea
            className="notes-input"
            rows={3}
            placeholder={t.notesPlaceholder || 'Payment terms, bank details, thank-you note...'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={rememberOrganization}
          />
        </section>

        <section className={`preview-pane ${mobileView === 'preview' ? '' : 'mobile-hidden'}`}>
          <div className="invoice-sheet" id="invoice-sheet">
            <div className="sheet-header centered-logo-header">
              <div className="header-col seller-info">
                <div className="seller-name">{agencyDisplayName || '—'}</div>
                {agencyDisplayAddress && <div className="seller-address">{agencyDisplayAddress}</div>}
                <div className="seller-meta">
                  {agency.vatNumber && (
                    <span>
                      VAT Number: <bdi dir="ltr">{agency.vatNumber}</bdi>
                    </span>
                  )}
                  {agency.crNumber && (
                    <span>
                      C.R. Number: <bdi dir="ltr">{agency.crNumber}</bdi>
                    </span>
                  )}
                </div>
                <div className="seller-meta">
                  {agency.phone && (
                    <span>
                      Phone: <bdi dir="ltr">{agency.phone}</bdi>
                    </span>
                  )}
                  {agency.email && (
                    <span>
                      Email: <bdi dir="ltr">{agency.email}</bdi>
                    </span>
                  )}
                </div>
              </div>

              <div className="header-col logo-center">
                {agency.logo ? (
                  <img className="seller-logo" src={agency.logo} alt={agencyDisplayName} />
                ) : (
                  <div className="seller-logo placeholder">{(agencyDisplayName || 'A')[0]}</div>
                )}
              </div>

              <div className="header-col doc-block">
                <div className="doc-title">{t.invoiceTitle || 'TAX INVOICE'}</div>
                <div className="doc-number">{invoiceNumber}</div>
                <div className="doc-date">
                  {t.date || 'Date'}: <bdi dir="ltr">{date}</bdi>
                </div>
                {dueDate && (
                  <div className="doc-date">
                    Due Date: <bdi dir="ltr">{dueDate}</bdi>
                  </div>
                )}
              </div>
            </div>

            <div className="ledger-rule" />

            <div className="bill-to">
              <div className="bill-to-label">{t.billTo || 'Billed To'}</div>
              <div className="bill-to-name">{buyerName || '—'}</div>
              {buyerAddress && <div className="bill-to-meta">{buyerAddress}</div>}
              <div className="bill-to-meta-group">
                {buyerVat && (
                  <span>VAT: <bdi dir="ltr">{buyerVat}</bdi></span>
                )}
                {buyerCr && (
                  <span>CR: <bdi dir="ltr">{buyerCr}</bdi></span>
                )}
              </div>
              <div className="bill-to-meta-group">
                {buyerPhone && (
                  <span>Phone: <bdi dir="ltr">{buyerPhone}</bdi></span>
                )}
                {buyerEmail && (
                  <span>Email: <bdi dir="ltr">{buyerEmail}</bdi></span>
                )}
              </div>
            </div>

            <table className="items-table">
              <thead>
                <tr>
                  <th className="col-desc">{t.description || 'Description'}</th>
                  <th className="col-num">{t.qty || 'Qty'}</th>
                  <th className="col-num">{t.unitPrice || 'Unit Price'}</th>
                  <th className="col-num">{t.lineTotal || 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="col-desc">{it.description || '—'}</td>
                    <td className="col-num">{Number(it.qty) || 0}</td>
                    <td className="col-num">{formatMoney(Number(it.unitPrice) || 0)}</td>
                    <td className="col-num">
                      {formatMoney((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="totals-block">
              <div className="totals-inner">
                <div className="totals-row">
                  <span>{t.subtotal || 'Subtotal'}</span>
                  <span>
                    {formatMoney(subtotal)} {t.sar || 'SAR'}
                  </span>
                </div>
                <div className="totals-row">
                  <span>{t.vat || 'VAT (15%)'}</span>
                  <span>
                    {formatMoney(vat)} {t.sar || 'SAR'}
                  </span>
                </div>
                <div className="totals-row total">
                  <span>{t.total || 'Total'}</span>
                  <span>
                    {formatMoney(total)} {t.sar || 'SAR'}
                  </span>
                </div>

                {paymentType !== 'full' && (
                  <>
                    <div className="totals-row split-row">
                      <span>Paid Amount:</span>
                      <span>
                        {formatMoney(amountPaid)} {t.sar || 'SAR'}
                      </span>
                    </div>
                    <div className="totals-row split-row highlight">
                      <span>Remaining Balance:</span>
                      <span>
                        {formatMoney(balanceDue)} {t.sar || 'SAR'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {notes && (
              <div className="notes-block">
                <div className="notes-label">{t.notes || 'Notes'}</div>
                <div className="notes-text">{notes}</div>
              </div>
            )}

            <div className="sheet-footer">
              {qrUrl && (
                <div className="qr-block">
                  <img src={qrUrl} alt="ZATCA QR" width={84} height={84} />
                  <span>{t.scanToVerify || 'Scan to verify'}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {settingsOpen && (
        <SettingsModal
          t={t}
          agency={agency}
          onCancel={() => setSettingsOpen(false)}
          onSave={saveAgency}
          onLogoFile={handleLogoFile}
          fileInputRef={fileInputRef}
        />
      )}

      {historyOpen && (
        <HistoryDrawer
          t={t}
          history={history}
          onClose={() => setHistoryOpen(false)}
          onLoad={loadFromHistory}
          onDelete={deleteHistoryEntry}
        />
      )}
    </div>
  );
}

function SettingsModal({ t, agency, onCancel, onSave, fileInputRef }) {
  const [form, setForm] = useState(agency);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div className="modal-overlay no-print" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>{t.setupTitle || 'Agency Details'}</h2>
        <p className="modal-body-text">{t.setupBody || 'Set up your default business details:'}</p>

        <div className="logo-uploader">
          {form.logo ? (
            <img src={form.logo} alt="logo" className="logo-preview" />
          ) : (
            <div className="logo-preview placeholder">{t.logo || 'Logo'}</div>
          )}
          <div className="logo-actions">
            <button type="button" className="btn subtle" onClick={() => fileInputRef.current?.click()}>
              {t.uploadLogo || 'Upload Logo'}
            </button>
            {form.logo && (
              <button type="button" className="btn ghost" onClick={() => set('logo', '')}>
                {t.removeLogo || 'Remove Logo'}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => set('logo', reader.result);
                reader.readAsDataURL(file);
              }}
            />
          </div>
        </div>
      <h2 className="section-subtitle">{t.clientDetails || 'Client details'}</h2>
<div className="field-grid two">
  <label className="field">
    <span>{t.buyerName || 'Organization / buyer name'}</span>
    <input
      value={buyerName}
      onChange={(e) => handleBuyerNameChange(e.target.value)}
      onBlur={rememberOrganization}
      list="saved-organizations"
    />
    <datalist id="saved-organizations">
      {orgList.map((org) => (
        <option value={org.name} key={org.name} />
      ))}
    </datalist>
  </label>
  <label className="field">
    <span>{t.buyerVat || 'Buyer VAT number (optional)'}</span>
    <input
      value={buyerVat}
      onChange={(e) => setBuyerVat(e.target.value)}
      onBlur={rememberOrganization}
    />
  </label>
</div>

<div className="field-grid two">
  <label className="field">
    <span>{t.buyerCr || 'CR Number'}</span>
    <input value={buyerCr} onChange={(e) => setBuyerCr(e.target.value)} onBlur={rememberOrganization} />
  </label>
  <label className="field">
    <span>{t.buyerAddress || 'Address'}</span>
    <input value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} onBlur={rememberOrganization} />
  </label>
</div>
        <div className="field-grid two">
          <label className="field">
            <span>{t.agencyName || 'Agency Name (EN)'}</span>
            <input value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
          </label>
          <label className="field">
            <span>{t.agencyNameAr || 'Agency Name (AR)'}</span>
            <input dir="rtl" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
          </label>
        </div>

        <div className="field-grid two">
          <label className="field">
            <span>{t.agencyAddress || 'Address (EN)'}</span>
            <input value={form.addressEn} onChange={(e) => set('addressEn', e.target.value)} />
          </label>
          <label className="field">
            <span>{t.agencyAddressAr || 'Address (AR)'}</span>
            <input dir="rtl" value={form.addressAr} onChange={(e) => set('addressAr', e.target.value)} />
          </label>
        </div>

        <div className="field-grid two">
          <label className="field">
            <span>{t.vatNumberLabel || 'VAT Number'}</span>
            <input value={form.vatNumber} onChange={(e) => set('vatNumber', e.target.value)} />
          </label>
          <label className="field">
            <span>{t.crNumberLabel || 'CR Number'}</span>
            <input value={form.crNumber} onChange={(e) => set('crNumber', e.target.value)} />
          </label>
        </div>

        <div className="field-grid two">
          <label className="field">
            <span>{t.phone || 'Phone'}</span>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </label>
          <label className="field">
            <span>{t.email || 'Email'}</span>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} />
          </label>
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel} type="button">
            {t.cancel || 'Cancel'}
          </button>
          <button className="btn primary" onClick={() => onSave(form)} type="button">
            {t.save || 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryDrawer({ t, history, onClose, onLoad, onDelete }) {
  return (
    <div className="modal-overlay no-print" role="dialog" aria-modal="true">
      <div className="modal history-modal">
        <div className="modal-actions-top">
          <h2>{t.history || 'Invoice History'}</h2>
          <button className="btn ghost" onClick={onClose} type="button">
            {t.close || 'Close'}
          </button>
        </div>
        {history.length === 0 ? (
          <p className="modal-body-text">{t.historyEmpty || 'No saved invoices.'}</p>
        ) : (
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.id} className="history-item">
                <div>
                  <div className="history-number">{h.invoiceNumber}</div>
                  <div className="history-meta">
                    {h.buyerName || '—'} · {h.date} · {formatMoney(h.total)} SAR
                  </div>
                </div>
                <div className="history-actions">
                  <button className="btn subtle" onClick={() => onLoad(h)} type="button">
                    {t.load || 'Load'}
                  </button>
                  <button className="icon-btn danger" onClick={() => onDelete(h.id)} type="button">
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}