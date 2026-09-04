import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app, ipcMain } from 'electron';
import axios from 'axios';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const ENCODING = 'hex';

export class DesktopLicenseManager {
  private licenseFilePath: string;
  private encryptionKey: Buffer;
  private apiUrl: string = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';

  constructor() {
    const userDataPath = app.getPath('userData');
    this.licenseFilePath = path.join(userDataPath, '.license');
    this.encryptionKey = this.deriveEncryptionKey();
  }

  /**
   * Derive encryption key from machine ID and username
   */
  private deriveEncryptionKey(): Buffer {
    const machineId = this.getMachineId();
    const username = process.env.USERNAME || process.env.USER || 'unknown';
    const combined = `${machineId}${username}`.padEnd(32, '0').substring(0, 32);
    return Buffer.from(combined, 'utf8');
  }

  /**
   * Get machine ID (device fingerprint)
   */
  private getMachineId(): string {
    // This is a simplified version; use `node-machine-id` in production
    const hostname = require('os').hostname();
    return crypto.createHash('sha256').update(hostname).digest('hex').substring(0, 16);
  }

  /**
   * Generate device fingerprint
   */
  generateDeviceFingerprint(): string {
    const osType = process.platform;
    const machineId = this.getMachineId();
    const username = process.env.USERNAME || process.env.USER || 'unknown';
    const combined = `${osType}::${machineId}::${username}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Encrypt and store license locally
   */
  storeLicense(licenseData: any): void {
    try {
      const iv = crypto.randomBytes(16);
      const salt = crypto.randomBytes(SALT_LENGTH);
      
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
      const plaintext = JSON.stringify(licenseData);
      
      let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
      encrypted += cipher.final(ENCODING);
      
      const authTag = cipher.getAuthTag();
      const combined = Buffer.concat([salt, iv, authTag, Buffer.from(encrypted, ENCODING)]);
      
      fs.writeFileSync(this.licenseFilePath, combined.toString('base64'), 'utf8');
      console.log('License stored successfully');
    } catch (error) {
      console.error('Failed to store license:', error);
      throw error;
    }
  }

  /**
   * Load and decrypt license from local storage
   */
  loadLicense(): any | null {
    try {
      if (!fs.existsSync(this.licenseFilePath)) {
        return null;
      }

      const encryptedData = fs.readFileSync(this.licenseFilePath, 'utf8');
      const buffer = Buffer.from(encryptedData, 'base64');
      
      const salt = buffer.subarray(0, SALT_LENGTH);
      const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + 16);
      const authTag = buffer.subarray(SALT_LENGTH + 16, SALT_LENGTH + 16 + TAG_LENGTH);
      const encrypted = buffer.subarray(SALT_LENGTH + 16 + TAG_LENGTH);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      console.error('Failed to load license:', error);
      return null;
    }
  }

  /**
   * Check license validity (online)
   */
  async verifyLicenseOnline(licenseId: string, activationKey: string): Promise<any> {
    try {
      const deviceFingerprint = this.generateDeviceFingerprint();
      
      const response = await axios.post(`${this.apiUrl}/licenses/verify`, {
        license_id: licenseId,
        activation_key: activationKey,
        device_fingerprint: deviceFingerprint
      });

      return response.data.data;
    } catch (error) {
      console.error('License verification failed:', error);
      throw error;
    }
  }

  /**
   * Activate license (first launch)
   */
  async activateLicense(email: string, licenseKey: string): Promise<any> {
    try {
      const deviceFingerprint = this.generateDeviceFingerprint();
      
      const response = await axios.post(`${this.apiUrl}/licenses/activate`, {
        email,
        license_key: licenseKey,
        device_fingerprint: deviceFingerprint
      });

      const licenseData = {
        license_id: response.data.data.license_id,
        activation_key: response.data.data.activation_key,
        device_fingerprint: deviceFingerprint,
        activation_date: new Date(),
        expiration_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      };

      this.storeLicense(licenseData);
      return licenseData;
    } catch (error) {
      console.error('License activation failed:', error);
      throw error;
    }
  }

  /**
   * Check if license is expired
   */
  isLicenseExpired(license: any): boolean {
    return new Date() > new Date(license.expiration_date);
  }

  /**
   * Get days remaining
   */
  getDaysRemaining(license: any): number {
    const now = new Date();
    const expiration = new Date(license.expiration_date);
    return Math.floor((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Remove/deactivate license
   */
  removeLicense(): void {
    try {
      if (fs.existsSync(this.licenseFilePath)) {
        fs.unlinkSync(this.licenseFilePath);
        console.log('License removed');
      }
    } catch (error) {
      console.error('Failed to remove license:', error);
    }
  }
}

export default DesktopLicenseManager;
