import { select } from '@inquirer/prompts';
import { Coin } from './coin/coin';
import { Bitcoin } from './coin/bitcoin';
import axios, { AxiosInstance } from 'axios';
import { Database } from 'better-sqlite3';
import DatabaseInstance = require('better-sqlite3');

export class Helper {

    api: AxiosInstance;

    coinRegistry: Coin[] = [];

    DB_FILE = 'acc.db';

    db: Database;

    constructor() {
        this.db = new DatabaseInstance(this.DB_FILE);
        this.api = axios.create({
            headers: { 'Content-Type': 'application/json' }
        });
        this.coinRegistry.push(new Bitcoin(this));
        // this.coinRegistry.push(new Litecoin());
        // this.coinRegistry.push(new Dogecoin());
        // this.coinRegistry.push(new BitcoinCash());
        // this.coinRegistry.push(new BitcoinSV());
        // this.coinRegistry.push(new Tron());
        // this.coinRegistry.push(new Monero());        
    }

    isInteger(value: any): boolean {
        const num = Number(value);
        return !isNaN(num) && Number.isInteger(num);
    }

    bigIntToUint8Array(value: bigint, byteLength?: number, littleEndian = false): Uint8Array {
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

    hexTo5bitBytes(hex: string): number[] {
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


    toHexString(bytes: Uint8Array): string {
        return Array.from(bytes)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    async chooseCoin(): Promise<Coin> {
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

        return this.getCoinInstance(coinName);
    }

    getCoinInstance(coinName: string): Coin {
        return this.coinRegistry.find(c => c.code === coinName);
    }

    getAllAccounts(): any {
        const stmt = this.db.prepare('select * from t_account');
        return stmt.all();
    }

    getUsingAddresses(accountName: string): any {
        const stmt = this.db.prepare('select * from t_address where name = ? and "using" = ?');
        return stmt.all(accountName, 1);
    }

    updateDb(accountName: string, i: string, value: number): void {
        const stmt = this.db.prepare('select * from t_address where name = ? and idx = ?');
        const addr_row: any = stmt.get(accountName, Number(i));

        if (!addr_row && value > 0) {
            const stmt = this.db.prepare('insert into t_address (name, idx, "using") values (?, ?, ?)');
            stmt.run(accountName, Number(i), 1);
        } else if (addr_row && addr_row.using === 0 && value > 0) {
            const stmt = this.db.prepare('update t_address set "using" = ? where name = ? and idx = ?');
            stmt.run(1, accountName, Number(i));
        } else if (addr_row && addr_row.using === 1 && value === 0) {
            const stmt = this.db.prepare('update t_address set "using" = ? where name = ? and idx = ?');
            stmt.run(0, accountName, Number(i));
        }
    }

    destroy(): void {
        this.db.close();
    }
}