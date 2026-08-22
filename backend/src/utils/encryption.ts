import crypto from 'crypto';
import { logger } from '../config/logger';

const ALGORITHM = 'aes-256-gcm';
const ENCODING = 'hex';
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;

export class EncryptionService {
  private encryptionKey: Buffer;

  constructor(keyString: string) {
    // Ensure key is 32 bytes for AES-256
    this.encryptionKey = Buffer.from(keyString.padEnd(32, '0').substring(0, 32), 'utf8');
  }

  encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const salt = crypto.randomBytes(SALT_LENGTH);
      
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
      encrypted += cipher.final(ENCODING);
      
      const authTag = cipher.getAuthTag();
      
      // Combine salt + iv + authTag + encrypted data
      const combined = Buffer.concat([salt, iv, authTag, Buffer.from(encrypted, ENCODING)]);
      return combined.toString('base64');
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw error;
    }
  }

  decrypt(encryptedData: string): string {
    try {
      const buffer = Buffer.from(encryptedData, 'base64');
      
      // Extract components
      const salt = buffer.subarray(0, SALT_LENGTH);
      const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + 16);
      const authTag = buffer.subarray(SALT_LENGTH + 16, SALT_LENGTH + 16 + TAG_LENGTH);
      const encrypted = buffer.subarray(SALT_LENGTH + 16 + TAG_LENGTH);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt license data');
    }
  }

  hash(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  generateHMAC(data: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  }

  verifyHMAC(data: string, hmac: string, secret: string): boolean {
    const expectedHmac = this.generateHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(hmac),
      Buffer.from(expectedHmac)
    );
  }

  generateDeviceFingerprint(
    osType: string,
    machineId: string,
    username: string
  ): string {
    const combined = `${osType}::${machineId}::${username}`;
    return this.hash(combined);
  }
}

export const encryptionService = new EncryptionService(
  process.env.ENCRYPTION_KEY || 'default-insecure-key-change-me'
);
