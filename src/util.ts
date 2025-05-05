import { select } from '@inquirer/prompts';
import { Coin } from './coin/coin';
import { Bitcoin } from './coin/bitcoin';

export class Util {

    static coinRegistry: Coin[] = [];

    static DB_FILE = 'acc.db';

    static isInteger(value: any): boolean {
        const num = Number(value);
        return !isNaN(num) && Number.isInteger(num);
    }

    static bigIntToUint8Array(value: bigint, byteLength?: number, littleEndian = false): Uint8Array {
        const bytes: number[] = [];

        let v = value;
        while (v > 0n) {
            bytes.push(Number(v & 0xffn));
            v >>= 8n;
        }

        if (byteLength) {
            while (bytes.length < byteLength) {
                bytes.push(0);
            }
        }

        const result = new Uint8Array(bytes);
        return littleEndian ? result : result.reverse();
    }

    static hexTo5bitBytes(hex: string): number[] {
        // Remove 0x prefix if present
        if (hex.startsWith("0x")) hex = hex.slice(2);
        if (hex.length % 2 !== 0) {
            throw new Error("Hex string must have even number of characters");
        }

        // Convert hex string to 8-bit bytes
        const bytes: number[] = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.slice(i, i + 2), 16));
        }

        // Convert from 8-bit bytes to 5-bit chunks
        const result: number[] = [];
        let buffer = 0;
        let bits = 0;

        for (let byte of bytes) {
            buffer = (buffer << 8) | byte;
            bits += 8;

            while (bits >= 5) {
                result.push((buffer >> (bits - 5)) & 0b11111);
                bits -= 5;
            }
        }

        // Handle remaining bits (optional: pad with zeroes)
        if (bits > 0) {
            result.push((buffer << (5 - bits)) & 0b11111);
        }

        return result;
    }


    static toHexString(bytes: Uint8Array): string {
        return Array.from(bytes)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    static async chooseCoin(): Promise<Coin> {
        if (this.coinRegistry.length === 0) {
            this.coinRegistry.push(new Bitcoin());
            // this.coinRegistry.push(new Litecoin());
            // this.coinRegistry.push(new Dogecoin());
            // this.coinRegistry.push(new BitcoinCash());
            // this.coinRegistry.push(new BitcoinSV());
            // this.coinRegistry.push(new Tron());
            // this.coinRegistry.push(new Monero());
        }

        const coins = [];
        this.coinRegistry.forEach(c => {
            coins.push(c.code);
        });

        const coinName: string = await select({
            message: 'Choose coin: ', choices: coins
        });

        console.log('----------------------------------');
        console.log('Current coin is: [' + coinName + ']');
        console.log('----------------------------------');

        return this.coinRegistry.find(c => c.code === coinName);
    }
}