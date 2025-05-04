import * as crypto from 'crypto';
import { input, select, password } from '@inquirer/prompts';
import * as fs from 'fs/promises';

// Generate a key from passphrase and salt using PBKDF2
function generateKey(passphrase: string, salt: crypto.BinaryLike): Buffer {
    return crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
}

// AES-256-GCM encryption
export function aes256gcmEncode(dataBuffer: Buffer, passphrase: string): Buffer {
    const salt = crypto.randomBytes(16);   // 16 bytes salt
    const nonce = crypto.randomBytes(12);  // 12 bytes nonce (IV for GCM)
    const key = generateKey(passphrase, salt);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Combine salt + nonce + tag + ciphertext
    return Buffer.concat([salt, nonce, tag, ciphertext]);
}

// AES-256-GCM decryption
export function aes256gcmDecode(encodedBuffer: Buffer, passphrase: string): Buffer {
    const salt = encodedBuffer.subarray(0, 16);
    const nonce = encodedBuffer.subarray(16, 28);
    const tag = encodedBuffer.subarray(28, 44);
    const ciphertext = encodedBuffer.subarray(44);

    const key = generateKey(passphrase, salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted;
}

// Main function
async function main(): Promise<void> {
    const step = await select({
        message: 'Choose your action: ', choices: [
            { value: 0, name: 'encrypt text' },
            { value: 1, name: 'decrypt from text' },
            { value: 2, name: 'decrypt from file' }
        ]
    });

    const passphrase = await password({ message: 'Passphrase: ', mask: '*' });

    if (step === 0) {
        const content = await input({ message: 'Text to be encrypted: ', required: true });
        const encrypted = aes256gcmEncode(Buffer.from(content, 'utf8'), passphrase);
        console.log('Encrypted data: ', encrypted.toString('hex'));
    } else if (step === 1) {
        const content = await input({ message: 'Text to be decrypted: ', required: true });
        const decrypted = aes256gcmDecode(Buffer.from(content, 'hex'), passphrase);
        console.log('Decrypted data: ', decrypted.toString('utf8'));
    } else if (step === 2) {
        const filePath = await input({ message: 'File name to be decrypted: ', required: true });
        const data = await fs.readFile(filePath, 'utf8');
        const decrypted = aes256gcmDecode(Buffer.from(data, 'hex'), passphrase);
        console.log('Decrypted data: ', decrypted.toString('utf8'));
    }
}

if (require.main === module) {
    main();
}