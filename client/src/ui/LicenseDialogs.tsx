import React, { useState, useEffect } from 'react';
import '../styles/LicenseDialog.css';

interface LicenseDialogProps {
  onActivate: (email: string, licenseKey: string) => Promise<void>;
  onRenew: (licenseId: string) => void;
  isVisible: boolean;
  license?: any;
  daysRemaining?: number;
}

export const LicenseActivationDialog: React.FC<LicenseDialogProps> = ({
  onActivate,
  isVisible,
  onRenew,
  license,
  daysRemaining
}) => {
  const [email, setEmail] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await onActivate(email, licenseKey);
    } catch (err: any) {
      setError(err.message || 'Activation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="license-dialog-overlay">
      <div className="license-dialog">
        <h2>Activate Your License</h2>
        
        <form onSubmit={handleActivate}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>License Key</label>
            <input
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Activating...' : 'Activate License'}
          </button>
        </form>
      </div>
    </div>
  );
};

export const LicenseBlockingDialog: React.FC<LicenseDialogProps> = ({
  license,
  daysRemaining,
  onRenew
}) => {
  const isExpired = license && daysRemaining !== undefined && daysRemaining <= 0;

  if (!isExpired) return null;

  return (
    <div className="license-dialog-overlay blocking">
      <div className="license-dialog blocking">
        <div className="blocking-header">
          <h1>🔒 Subscription Expired</h1>
        </div>

        <div className="blocking-content">
          <p className="main-message">
            Your subscription has expired. Please renew your license to continue using this software.
          </p>

          <div className="license-info">
            <p><strong>License ID:</strong> {license?.license_id}</p>
            <p><strong>Expired on:</strong> {new Date(license?.expiration_date).toLocaleDateString()}</p>
          </div>

          <div className="renewal-benefits">
            <h3>Renew Your Subscription</h3>
            <ul>
              <li>✓ Full access to all features</li>
              <li>✓ One year of updates</li>
              <li>✓ Priority support</li>
              <li>✓ Early access to new features</li>
            </ul>
          </div>

          <button
            className="btn btn-primary btn-large"
            onClick={() => onRenew(license?.license_id)}
          >
            🔄 Renew Subscription Now
          </button>

          <p className="support-text">
            Questions? Contact <a href="mailto:support@yourdomain.com">support@yourdomain.com</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export const LicenseWarningBanner: React.FC<{ daysRemaining?: number; onRenew: (id: string) => void; licenseId?: string }> = ({
  daysRemaining,
  onRenew,
  licenseId
}) => {
  if (!daysRemaining || daysRemaining > 30) return null;

  return (
    <div className={`license-warning-banner ${daysRemaining <= 7 ? 'critical' : 'warning'}`}>
      <div className="banner-content">
        <span className="banner-message">
          ⚠️ Your subscription expires in {daysRemaining} days
        </span>
        <button
          className="btn btn-small"
          onClick={() => onRenew(licenseId || '')}
        >
          Renew Now
        </button>
      </div>
    </div>
  );
};
