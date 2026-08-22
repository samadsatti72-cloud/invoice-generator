import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import html2pdf from 'html2pdf.js';
import { LABELS } from './labels';
import { generateZatcaQrDataUrl } from './zatca';
import './App.css';

const SETTINGS_KEY = 'invoiceapp.agencySettings';
const COUNTER_KEY = 'invoiceapp.counter';
const QUOTE_COUNTER_KEY = 'invoiceapp.quoteCounter';
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

function nextDocNumber(type) {
  const key = type === 'quotation' ? QUOTE_COUNTER_KEY : COUNTER_KEY;
  const prefix = type === 'quotation' ? 'QUO' : 'INV';
  const n = loadJSON(key, 0) + 1;
  localStorage.setItem(key, JSON.stringify(n));
  return `${prefix}-${String(n).padStart(4, '0')}`;
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

  const [invoiceNumber, setInvoiceNumber] = useState(() => nextDocNumber('invoice'));
  const [date, setDate] = useState(() => todayISO());
  const [dueDate, setDueDate] = useState('');
  const [docType, setDocType] = useState('invoice'); // 'invoice' | 'quotation'

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
  const [discountType, setDiscountType] = useState('none'); // 'none' | 'percent' | 'fixed'
  const [discountValue, setDiscountValue] = useState(0);
  const [installmentCount, setInstallmentCount] = useState(12);
  const [installmentFrequency, setInstallmentFrequency] = useState('monthly'); // 'monthly' | 'quarterly'
  const [installmentStart, setInstallmentStart] = useState(() => todayISO());
  const [qrUrl, setQrUrl] = useState(null);
  const [mobileView, setMobileView] = useState('edit');
  const [langFading, setLangFading] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.dir = t.dir || 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem(LANG_KEY, JSON.stringify(lang));
  }, [lang, t.dir]);

  // Smoothly cross-fades the whole UI when the language (and therefore the
  // text direction) changes, instead of an abrupt LTR/RTL flip. Uses the
  // native View Transitions API where available for a polished cross-fade,
  // and falls back to a manual opacity transition everywhere else.
  function switchLanguage(nextLang) {
    if (nextLang === lang) return;
    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(() => {
        flushSync(() => setLang(nextLang));
      });
    } else {
      setLangFading(true);
      window.setTimeout(() => {
        setLang(nextLang);
        requestAnimationFrame(() => setLangFading(false));
      }, 160);
    }
  }

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0),
    [items]
  );
  const discountAmount = useMemo(() => {
    if (discountType === 'percent') return subtotal * (Math.min(100, Math.max(0, Number(discountValue) || 0)) / 100);
    if (discountType === 'fixed') return Math.min(subtotal, Math.max(0, Number(discountValue) || 0));
    return 0;
  }, [discountType, discountValue, subtotal]);
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const vat = discountedSubtotal * 0.15;
  const total = discountedSubtotal + vat;

  // Splits `total` into N evenly-sized installments (e.g. a 12-month yearly
  // plan). The last installment absorbs any rounding remainder so the
  // installments always sum exactly back to the total.
  const installmentSchedule = useMemo(() => {
    if (paymentType !== 'installments') return [];
    const count = Math.max(1, Math.round(Number(installmentCount)) || 1);
    const base = Math.floor((total / count) * 100) / 100;
    const start = installmentStart ? new Date(`${installmentStart}T12:00:00`) : new Date();
    const rows = [];
    let allocated = 0;
    for (let i = 0; i < count; i++) {
      const amount = i === count - 1 ? Math.round((total - allocated) * 100) / 100 : base;
      allocated += amount;
      const due = new Date(start);
      due.setMonth(due.getMonth() + i * (installmentFrequency === 'quarterly' ? 3 : 1));
      rows.push({ index: i + 1, dueDate: due.toISOString().slice(0, 10), amount });
    }
    return rows;
  }, [paymentType, installmentCount, installmentFrequency, installmentStart, total]);

  useEffect(() => {
    if (paymentType === 'full') {
      setAmountPaid(total);
    } else if (paymentType === 'half') {
      setAmountPaid(total / 2);
    }
  }, [paymentType, total]);

  const balanceDue = useMemo(() => Math.max(0, total - (Number(amountPaid) || 0)), [total, amountPaid]);

  useEffect(() => {
    if (docType !== 'invoice') {
      setQrUrl(null);
      return;
    }
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
  }, [agency.nameAr, agency.nameEn, agency.vatNumber, date, total, vat, lang, docType]);

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

  function persistAgency(next) {
    setAgency(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }

  function saveAgency(next) {
    persistAgency(next);
    setSettingsOpen(false);
  }

  function handleLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAgency((a) => ({ ...a, logo: reader.result }));
    reader.readAsDataURL(file);
  }

  function handleDocTypeChange(next) {
    if (next === docType) return;
    setDocType(next);
    setInvoiceNumber(nextDocNumber(next));
  }

  // Turns the current quotation into a real invoice: assigns a fresh
  // invoice number (from the invoice counter, not the quotation counter)
  // and switches on normal payment terms, while keeping every line item,
  // buyer, and note exactly as quoted.
  function convertToInvoice() {
    setDocType('invoice');
    setInvoiceNumber(nextDocNumber('invoice'));
    setPaymentType('full');
  }

  // Clones the current document (same type) under a brand-new number, for
  // repeat clients or recurring line items, without retyping everything.
  function duplicateDocument() {
    setInvoiceNumber(nextDocNumber(docType));
    setDate(todayISO());
  }

  function startNewInvoice() {
    setDocType('invoice');
    setInvoiceNumber(nextDocNumber('invoice'));
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
    setDiscountType('none');
    setDiscountValue(0);
    setInstallmentCount(12);
    setInstallmentFrequency('monthly');
    setInstallmentStart(todayISO());
    setItems([emptyItem()]);
    setMobileView('edit');
  }

  function saveToHistory() {
    rememberOrganization();
    const entry = {
      id: uid(),
      docType,
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
      discountType,
      discountValue,
      paymentType,
      amountPaid,
      balanceDue,
      installmentCount,
      installmentFrequency,
      installmentStart,
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
    setDocType(entry.docType || 'invoice');
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
    setDiscountType(entry.discountType || 'none');
    setDiscountValue(entry.discountValue || 0);
    if (entry.installmentCount) setInstallmentCount(entry.installmentCount);
    if (entry.installmentFrequency) setInstallmentFrequency(entry.installmentFrequency);
    if (entry.installmentStart) setInstallmentStart(entry.installmentStart);
    if (entry.paymentType) {
      setPaymentType(entry.paymentType);
    } else if (entry.amountPaid !== undefined) {
      setPaymentType(entry.amountPaid === entry.total ? 'full' : 'custom');
    }
    if (entry.amountPaid !== undefined) setAmountPaid(entry.amountPaid);
    switchLanguage(entry.lang || 'en');
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
    <div className={`shell${langFading ? ' lang-fading' : ''}`} dir={t.dir || 'ltr'}>
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
          <button
            className="btn ghost lang-toggle"
            onClick={() => switchLanguage(lang === 'en' ? 'ar' : 'en')}
            aria-label="Switch language"
          >
            <span className="lang-toggle-icon" aria-hidden="true">🌐</span>
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
          <button className="btn ghost" onClick={duplicateDocument}>
            {t.duplicateDoc || 'Duplicate'}
          </button>
          <button className="btn ghost" onClick={handlePrint}>
            {t.print || 'Print'}
          </button>
          <button className="btn primary" onClick={handleDownloadPdf}>
            {t.savePdf || 'Save as PDF'}
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

          <div className="doctype-row">
            <div className="doctype-toggle" role="tablist" aria-label={t.docTypeToggleLabel || 'Document Type'}>
              <button
                type="button"
                role="tab"
                aria-selected={docType === 'invoice'}
                className={docType === 'invoice' ? 'active' : ''}
                onClick={() => handleDocTypeChange('invoice')}
              >
                {t.docTypeInvoice || 'Tax Invoice'}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={docType === 'quotation'}
                className={docType === 'quotation' ? 'active' : ''}
                onClick={() => handleDocTypeChange('quotation')}
              >
                {t.docTypeQuotation || 'Quotation'}
              </button>
            </div>
            {docType === 'quotation' && (
              <button type="button" className="btn subtle" onClick={convertToInvoice}>
                {t.convertToInvoice || 'Convert to Invoice'}
              </button>
            )}
          </div>

          <div className="field-grid two">
            <label className="field">
              <span>{docType === 'quotation' ? t.quotationNumber || 'Quotation No.' : t.invoiceNumber || 'Invoice No.'}</span>
              <input dir="ltr" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </label>
            <label className="field">
              <span>{t.date || 'Date'}</span>
              <input dir="ltr" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          <h2 className="section-subtitle">{t.buyerInfoSection || 'Buyer / Organization Information'}</h2>
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
              <span>{t.buyerCrNumber || 'CR Number'} <em className="hint">({t.optional || 'optional'})</em></span>
              <input
                dir="ltr"
                value={buyerCr}
                onChange={(e) => setBuyerCr(e.target.value)}
                onBlur={rememberOrganization}
              />
            </label>
            <label className="field">
              <span>{t.buyerAddressLabel || 'Buyer Address'} <em className="hint">({t.optional || 'optional'})</em></span>
              <input
                value={buyerAddress}
                onChange={(e) => setBuyerAddress(e.target.value)}
                onBlur={rememberOrganization}
              />
            </label>
          </div>

          <div className="field-grid two">
            <label className="field">
              <span>{t.buyerPhoneLabel || 'Mobile / Phone'} <em className="hint">({t.optional || 'optional'})</em></span>
              <input
                dir="ltr"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                onBlur={rememberOrganization}
              />
            </label>
            <label className="field">
              <span>{t.buyerEmailLabel || 'Email Address'} <em className="hint">({t.optional || 'optional'})</em></span>
              <input
                dir="ltr"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                onBlur={rememberOrganization}
              />
            </label>
          </div>

          {docType === 'invoice' ? (
            <>
              <h2 className="section-subtitle">{t.paymentSection || 'Payment Terms & Split Payments'}</h2>
              <div className="field-grid two">
                <label className="field">
                  <span>{t.paymentOption || 'Payment Option'}</span>
                  <select className="select-input" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                    <option value="full">{t.paidFull || 'Paid Full'}</option>
                    <option value="half">{t.halfPayment || 'Half Payment (50%)'}</option>
                    <option value="custom">{t.customPartial || 'Custom Partial Payment'}</option>
                    <option value="installments">{t.paymentInstallments || 'Yearly Payment Plan (Installments)'}</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t.dueDateForBalance || 'Due Date for Remaining Balance'}</span>
                  <input dir="ltr" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
              </div>

              {(paymentType === 'half' || paymentType === 'custom') && (
                <div className="field-grid two">
                  <label className="field">
                    <span>{t.amountPaidLabel || 'Amount Paid'}</span>
                    <input
                      dir="ltr"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(Number(e.target.value))}
                    />
                  </label>
                  <label className="field">
                    <span>{t.remainingBalanceLabel || 'Remaining Balance'}</span>
                    <input dir="ltr" type="text" readOnly value={formatMoney(balanceDue)} disabled />
                  </label>
                </div>
              )}

              {paymentType === 'installments' && (
                <div className="installment-plan">
                  <div className="field-grid two">
                    <label className="field">
                      <span>{t.installmentCountLabel || 'Number of Installments'}</span>
                      <input
                        dir="ltr"
                        type="number"
                        min="2"
                        max="60"
                        step="1"
                        value={installmentCount}
                        onChange={(e) => setInstallmentCount(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>{t.installmentFrequencyLabel || 'Frequency'}</span>
                      <select
                        className="select-input"
                        value={installmentFrequency}
                        onChange={(e) => setInstallmentFrequency(e.target.value)}
                      >
                        <option value="monthly">{t.frequencyMonthly || 'Monthly'}</option>
                        <option value="quarterly">{t.frequencyQuarterly || 'Quarterly'}</option>
                      </select>
                    </label>
                  </div>
                  <div className="field-grid two">
                    <label className="field">
                      <span>{t.installmentStartLabel || 'First Payment Date'}</span>
                      <input
                        dir="ltr"
                        type="date"
                        value={installmentStart}
                        onChange={(e) => setInstallmentStart(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="installment-preview">
                    <div className="installment-preview-title">
                      {t.installmentScheduleTitle || 'Payment Schedule'}
                    </div>
                    <ul className="installment-preview-list">
                      {installmentSchedule.map((row) => (
                        <li key={row.index}>
                          <span>#{row.index}</span>
                          <bdi dir="ltr">{row.dueDate}</bdi>
                          <bdi dir="ltr">
                            {formatMoney(row.amount)} {t.sar || 'SAR'}
                          </bdi>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="section-subtitle">{t.quotationValiditySection || 'Quotation Validity'}</h2>
              <div className="field-grid two">
                <label className="field">
                  <span>{t.validUntil || 'Valid Until'}</span>
                  <input dir="ltr" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
              </div>
            </>
          )}

          <h2 className="section-subtitle">{t.discountLabel || 'Discount'}</h2>
          <div className="field-grid two">
            <label className="field">
              <span>{t.discountLabel || 'Discount'}</span>
              <select className="select-input" value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
                <option value="none">{t.discountNone || 'No discount'}</option>
                <option value="percent">{t.discountPercent || 'Percentage (%)'}</option>
                <option value="fixed">{t.discountFixed || 'Fixed amount'}</option>
              </select>
            </label>
            {discountType !== 'none' && (
              <label className="field">
                <span>{t.discountValueLabel || 'Discount Value'}</span>
                <input
                  dir="ltr"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                />
              </label>
            )}
          </div>

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
                  dir="ltr"
                  type="number"
                  min="0"
                  step="1"
                  value={it.qty}
                  onChange={(e) => updateItem(it.id, { qty: e.target.value })}
                />
                <input
                  className="item-price"
                  dir="ltr"
                  type="number"
                  min="0"
                  step="0.01"
                  value={it.unitPrice}
                  onChange={(e) => updateItem(it.id, { unitPrice: e.target.value })}
                />
                <span className="item-amount" dir="ltr">
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
            {t.addLine || '+ Add line'}
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
                      {t.vatNumberLabel || 'VAT Number'}: <bdi dir="ltr">{agency.vatNumber}</bdi>
                    </span>
                  )}
                  {agency.crNumber && (
                    <span>
                      {t.crNumberLabel || 'C.R. Number'}: <bdi dir="ltr">{agency.crNumber}</bdi>
                    </span>
                  )}
                </div>
                <div className="seller-meta">
                  {agency.phone && (
                    <span>
                      {t.phone || 'Phone'}: <bdi dir="ltr">{agency.phone}</bdi>
                    </span>
                  )}
                  {agency.email && (
                    <span>
                      {t.email || 'Email'}: <bdi dir="ltr">{agency.email}</bdi>
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
                <div className="doc-title">
                  {docType === 'quotation' ? t.quotationTitle || 'QUOTATION' : t.invoiceTitle || 'TAX INVOICE'}
                </div>
                <div className="doc-number">{invoiceNumber}</div>
                <div className="doc-date">
                  {t.date || 'Date'}: <bdi dir="ltr">{date}</bdi>
                </div>
                {dueDate && (
                  <div className="doc-date">
                    {docType === 'quotation' ? t.validUntil || 'Valid Until' : t.dueDateInline || 'Due Date'}:{' '}
                    <bdi dir="ltr">{dueDate}</bdi>
                  </div>
                )}
              </div>
            </div>

            <div className="ledger-rule" />

            <div className="bill-to">
              <div className="bill-to-label">
                {docType === 'quotation' ? t.quotationFor || 'Quotation For' : t.billTo || 'Billed To'}
              </div>
              <div className="bill-to-name">{buyerName || '—'}</div>
              {buyerAddress && <div className="bill-to-meta">{buyerAddress}</div>}
              <div className="bill-to-meta-group">
                {buyerVat && (
                  <span>{t.vatShort || 'VAT'}: <bdi dir="ltr">{buyerVat}</bdi></span>
                )}
                {buyerCr && (
                  <span>{t.crShort || 'CR'}: <bdi dir="ltr">{buyerCr}</bdi></span>
                )}
              </div>
              <div className="bill-to-meta-group">
                {buyerPhone && (
                  <span>{t.phone || 'Phone'}: <bdi dir="ltr">{buyerPhone}</bdi></span>
                )}
                {buyerEmail && (
                  <span>{t.email || 'Email'}: <bdi dir="ltr">{buyerEmail}</bdi></span>
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
                    <td className="col-num"><bdi dir="ltr">{Number(it.qty) || 0}</bdi></td>
                    <td className="col-num"><bdi dir="ltr">{formatMoney(Number(it.unitPrice) || 0)}</bdi></td>
                    <td className="col-num">
                      <bdi dir="ltr">{formatMoney((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="totals-block">
              <div className="totals-inner">
                <div className="totals-row">
                  <span>{t.subtotal || 'Subtotal'}</span>
                  <bdi dir="ltr" className="totals-amount">
                    {formatMoney(subtotal)} {t.sar || 'SAR'}
                  </bdi>
                </div>
                {discountAmount > 0 && (
                  <div className="totals-row discount-row">
                    <span>{t.discountLabel || 'Discount'}</span>
                    <bdi dir="ltr" className="totals-amount">
                      -{formatMoney(discountAmount)} {t.sar || 'SAR'}
                    </bdi>
                  </div>
                )}
                <div className="totals-row">
                  <span>{t.vat || 'VAT (15%)'}</span>
                  <bdi dir="ltr" className="totals-amount">
                    {formatMoney(vat)} {t.sar || 'SAR'}
                  </bdi>
                </div>
                <div className="totals-row total">
                  <span>{docType === 'quotation' ? t.estimatedTotal || 'Estimated Total' : t.total || 'Total'}</span>
                  <bdi dir="ltr" className="totals-amount">
                    {formatMoney(total)} {t.sar || 'SAR'}
                  </bdi>
                </div>

                {docType === 'invoice' && (paymentType === 'half' || paymentType === 'custom') && (
                  <>
                    <div className="totals-row split-row">
                      <span>{t.paidAmountInline || 'Paid Amount'}:</span>
                      <bdi dir="ltr" className="totals-amount">
                        {formatMoney(amountPaid)} {t.sar || 'SAR'}
                      </bdi>
                    </div>
                    <div className="totals-row split-row highlight">
                      <span>{t.remainingBalanceInline || 'Remaining Balance'}:</span>
                      <bdi dir="ltr" className="totals-amount">
                        {formatMoney(balanceDue)} {t.sar || 'SAR'}
                      </bdi>
                    </div>
                  </>
                )}
              </div>
            </div>

            {docType === 'invoice' && paymentType === 'installments' && installmentSchedule.length > 0 && (
              <div className="installment-schedule-block">
                <div className="installment-schedule-title">
                  {t.installmentScheduleTitle || 'Payment Schedule'}
                </div>
                <table className="installment-table">
                  <thead>
                    <tr>
                      <th>{t.installmentNumberCol || '#'}</th>
                      <th>{t.installmentDueCol || 'Due Date'}</th>
                      <th>{t.installmentAmountCol || 'Amount'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installmentSchedule.map((row) => (
                      <tr key={row.index}>
                        <td>{row.index}</td>
                        <td>
                          <bdi dir="ltr">{row.dueDate}</bdi>
                        </td>
                        <td>
                          <bdi dir="ltr">
                            {formatMoney(row.amount)} {t.sar || 'SAR'}
                          </bdi>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {notes && (
              <div className="notes-block">
                <div className="notes-label">{t.notes || 'Notes'}</div>
                <div className="notes-text">{notes}</div>
              </div>
            )}

            <div className="sheet-footer">
              {docType === 'invoice' && qrUrl && (
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
          onAutosave={persistAgency}
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

function SettingsModal({ t, agency, onCancel, onSave, onAutosave, fileInputRef }) {
  const [form, setForm] = useState(agency);

  // Autosave as the person types, debounced. This is the fix for
  // "closing and reopening asks for organization details again" — data
  // used to only persist when the explicit Save button was clicked, so
  // closing any other way (tab close, accidental Cancel) silently lost
  // everything that had been typed.
  useEffect(() => {
    const id = setTimeout(() => {
      onAutosave?.(form);
    }, 400);
    return () => clearTimeout(id);
  }, [form, onAutosave]);

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
                  <div className="history-number">
                    {h.invoiceNumber}
                    <span className={`doc-badge ${h.docType === 'quotation' ? 'quotation' : 'invoice'}`}>
                      {h.docType === 'quotation' ? t.docBadgeQuotation || 'Quotation' : t.docBadgeInvoice || 'Invoice'}
                    </span>
                  </div>
                  <div className="history-meta">
                    {h.buyerName || '—'} ·{' '}
                    <bdi dir="ltr">
                      {h.date} · {formatMoney(h.total)} {t.sar || 'SAR'}
                    </bdi>
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