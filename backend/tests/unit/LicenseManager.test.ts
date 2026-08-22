import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import DesktopLicenseManager from '../modules/LicenseManager';

describe('DesktopLicenseManager', () => {
  let manager: DesktopLicenseManager;

  beforeEach(() => {
    manager = new DesktopLicenseManager();
  });

  describe('Device Fingerprint', () => {
    it('should generate consistent device fingerprint', () => {
      const fp1 = manager.generateDeviceFingerprint();
      const fp2 = manager.generateDeviceFingerprint();
      expect(fp1).toBe(fp2);
    });

    it('should generate 64-character SHA256 hash', () => {
      const fp = manager.generateDeviceFingerprint();
      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('License Storage', () => {
    it('should store and load encrypted license', () => {
      const licenseData = {
        license_id: 'LIC-2024-001',
        activation_key: 'test-key-123',
        expiration_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      };

      manager.storeLicense(licenseData);
      const loaded = manager.loadLicense();

      expect(loaded).not.toBeNull();
      expect(loaded.license_id).toBe('LIC-2024-001');
    });

    it('should return null when no license exists', () => {
      manager.removeLicense();
      const loaded = manager.loadLicense();
      expect(loaded).toBeNull();
    });
  });

  describe('License Expiration', () => {
    it('should correctly identify expired license', () => {
      const expiredLicense = {
        expiration_date: new Date(Date.now() - 1000 * 60 * 60 * 24) // Yesterday
      };
      expect(manager.isLicenseExpired(expiredLicense)).toBe(true);
    });

    it('should correctly identify valid license', () => {
      const validLicense = {
        expiration_date: new Date(Date.now() + 1000 * 60 * 60 * 24) // Tomorrow
      };
      expect(manager.isLicenseExpired(validLicense)).toBe(false);
    });

    it('should calculate days remaining correctly', () => {
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
      const license = { expiration_date: future };
      const daysRemaining = manager.getDaysRemaining(license);
      expect(daysRemaining).toBeGreaterThanOrEqual(9);
      expect(daysRemaining).toBeLessThanOrEqual(10);
    });
  });

  describe('License Removal', () => {
    it('should safely remove license file', () => {
      const licenseData = {
        license_id: 'LIC-2024-001',
        activation_key: 'test-key'
      };

      manager.storeLicense(licenseData);
      expect(manager.loadLicense()).not.toBeNull();

      manager.removeLicense();
      expect(manager.loadLicense()).toBeNull();
    });

    it('should not throw error when removing non-existent license', () => {
      expect(() => {
        manager.removeLicense();
      }).not.toThrow();
    });
  });
});
