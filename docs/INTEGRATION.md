## Integration Guide - Desktop Client

This guide shows how to integrate the license system into your desktop application.

### 1. Installation

```bash
npm install @your-org/license-client
```

### 2. Initialize License Manager

```typescript
import DesktopLicenseManager from '@your-org/license-client/modules/LicenseManager';

const licenseManager = new DesktopLicenseManager();
```

### 3. First Launch - Activation

```typescript
// User enters email and license key
const licenseData = await licenseManager.activateLicense(
  'user@example.com',
  'LIC-2024-ABC123'
);

// License data is now encrypted and stored locally
console.log('License activated:', licenseData);
```

### 4. On Application Startup - Verify License

```typescript
// Check if license is valid
const license = licenseManager.loadLicense();

if (!license) {
  // Show activation dialog
  showActivationDialog();
} else {
  try {
    // Verify with server (online)
    const verification = await licenseManager.verifyLicenseOnline(
      license.license_id,
      license.activation_key
    );

    if (verification.is_expired && verification.grace_period_ended) {
      // Show blocking dialog
      showBlockingDialog(verification);
    } else if (verification.days_remaining < 30) {
      // Show warning banner
      showWarningBanner(verification.days_remaining);
    } else {
      // Everything OK
      startApplication();
    }
  } catch (error) {
    // Offline - use cached license
    const daysRemaining = licenseManager.getDaysRemaining(license);
    
    if (licenseManager.isLicenseExpired(license)) {
      if (daysRemaining < -14) { // Grace period ended
        showBlockingDialog();
      } else {
        // Still in grace period
        showWarningBanner(daysRemaining);
        startApplication();
      }
    } else {
      // License still valid
      startApplication();
    }
  }
}
```

### 5. Renewal - Open Payment Portal

```typescript
// When user clicks "Renew"
function handleRenewalClick(licenseId: string) {
  // Create checkout session
  const response = await fetch('https://api.yourdomain.com/api/v1/payments/checkout', {
    method: 'POST',
    body: JSON.stringify({
      license_id: licenseId,
      email: userEmail
    })
  });

  const { checkout_url } = await response.json();

  // Open in default browser
  shell.openExternal(checkout_url);

  // Poll for payment completion (every 5 seconds)
  const pollInterval = setInterval(async () => {
    // After payment, verification will automatically detect renewal
    const verification = await licenseManager.verifyLicenseOnline(...);
    
    if (!verification.is_expired) {
      clearInterval(pollInterval);
      showSuccessMessage();
      // Reload application or refresh UI
    }
  }, 5000);
}
```

### 6. Complete Example (Electron Main Process)

```typescript
import { app, BrowserWindow, shell } from 'electron';
import DesktopLicenseManager from './modules/LicenseManager';

let mainWindow: BrowserWindow;
const licenseManager = new DesktopLicenseManager();

app.on('ready', async () => {
  // Check license before showing window
  const license = licenseManager.loadLicense();

  if (!license) {
    // Show activation window
    createActivationWindow();
  } else {
    // Verify license
    try {
      const verification = await licenseManager.verifyLicenseOnline(
        license.license_id,
        license.activation_key
      );

      if (verification.is_expired && verification.grace_period_ended) {
        createBlockingWindow();
      } else {
        createMainWindow();
      }
    } catch (error) {
      // Offline - check cached license
      if (licenseManager.isLicenseExpired(license)) {
        createBlockingWindow();
      } else {
        createMainWindow();
      }
    }
  }
});

function createActivationWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    webPreferences: { preload: './preload.js' }
  });

  mainWindow.loadFile('activation.html');
}

function createBlockingWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    webPreferences: { preload: './preload.js' }
  });

  mainWindow.loadFile('blocking.html');
  
  // Prevent closing
  mainWindow.on('close', (event) => {
    event.preventDefault();
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { preload: './preload.js' }
  });

  mainWindow.loadFile('index.html');
}

// IPC handlers for license operations
ipcMain.handle('activate-license', async (event, email, licenseKey) => {
  const result = await licenseManager.activateLicense(email, licenseKey);
  return result;
});

ipcMain.handle('open-renewal', async (event, licenseId, email) => {
  const response = await fetch('https://api.yourdomain.com/api/v1/payments/checkout', {
    method: 'POST',
    body: JSON.stringify({ license_id: licenseId, email })
  });
  
  const { checkout_url } = await response.json();
  shell.openExternal(checkout_url);
});

ipcMain.handle('get-license-status', async () => {
  const license = licenseManager.loadLicense();
  if (!license) return null;

  try {
    return await licenseManager.verifyLicenseOnline(
      license.license_id,
      license.activation_key
    );
  } catch {
    return {
      days_remaining: licenseManager.getDaysRemaining(license),
      is_expired: licenseManager.isLicenseExpired(license)
    };
  }
});
```

### 7. UI Components in React

```tsx
import React from 'react';
import { LicenseActivationDialog, LicenseBlockingDialog, LicenseWarningBanner } from '@your-org/license-client/ui';

function App() {
  const [license, setLicense] = React.useState(null);
  const [daysRemaining, setDaysRemaining] = React.useState(365);

  React.useEffect(() => {
    checkLicense();
    // Re-check every hour
    const interval = setInterval(checkLicense, 3600000);
    return () => clearInterval(interval);
  }, []);

  async function checkLicense() {
    const status = await window.electron.ipcRenderer.invoke('get-license-status');
    setLicense(status);
    setDaysRemaining(status?.days_remaining || 365);
  }

  return (
    <>
      <LicenseWarningBanner 
        daysRemaining={daysRemaining}
        licenseId={license?.license_id}
        onRenew={handleRenewal}
      />

      <LicenseBlockingDialog 
        license={license}
        daysRemaining={daysRemaining}
        onRenew={handleRenewal}
      />

      {/* Your app content */}
    </>
  );

  async function handleRenewal(licenseId: string) {
    await window.electron.ipcRenderer.invoke('open-renewal', licenseId, userEmail);
  }
}

export default App;
```

### 8. Testing License Integration

```typescript
// Mock the license manager for testing
jest.mock('./modules/LicenseManager', () => {
  return {
    __esModule: true,
    default: class MockLicenseManager {
      loadLicense = jest.fn(() => ({
        license_id: 'TEST-LICENSE',
        expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }));

      verifyLicenseOnline = jest.fn(async () => ({
        status: 'active',
        days_remaining: 30,
        is_expired: false
      }));

      isLicenseExpired = jest.fn((license) => {
        return new Date() > new Date(license.expiration_date);
      });

      getDaysRemaining = jest.fn((license) => {
        const now = new Date();
        const expiration = new Date(license.expiration_date);
        return Math.floor((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      });
    }
  };
});
```

### 9. Troubleshooting

**License verification hangs**
- Set request timeout to 5 seconds
- Implement offline fallback
- Log network errors

**License file corrupted**
- Remove file and request reactivation
- Implement backup copy of license

**Device fingerprint changes**
- Handle gracefully with reactivation
- Log device fingerprint changes for security audit

**Payment not updating license**
- Implement manual sync button
- Display session ID for support

### 10. Best Practices

✅ **Do**
- Always verify license on app startup
- Implement offline grace period
- Show clear error messages
- Log all license events
- Handle network timeouts gracefully
- Encrypt license file locally

❌ **Don't**
- Store license key in plaintext
- Share device fingerprint
- Remove license check code
- Disable expiration warnings
- Log sensitive license data
- Trust only local license data

---

**For more details, see:**
- [Architecture Documentation](../docs/ARCHITECTURE.md)
- [API Documentation](../docs/API.md)
- [Deployment Guide](../docs/DEPLOYMENT.md)
