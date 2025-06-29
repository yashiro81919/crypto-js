import { select } from '@inquirer/prompts';
import { Coin } from './coin/coin';
import { Bitcoin } from './coin/bitcoin';
import axios, { AxiosInstance } from 'axios';
import { sha256 } from '@noble/hashes/sha2';
import { Database } from 'better-sqlite3';
import DatabaseInstance = require('better-sqlite3');

export class Helper {

    api: AxiosInstance;

    coinRegistry: Coin[] = [];

    DB_FILE = 'acc.db';

    db: Database;

    constructor() {
        const fs = require('fs');
        if (fs.existsSync(this.DB_FILE)) {
            this.db = new DatabaseInstance(this.DB_FILE);
        }
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

    isFloat(value: string): boolean {
        value = value.trim();
        const num = Number(value);
        return !isNaN(num) && isFinite(num);
    }

    isInteger(value: string): boolean {
        value = value.trim();
        const num = Number(value);
        return !isNaN(num) && Number.isInteger(num);
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

    // Double SHA-256
    hash256(hex: string): string {
        const firstSHA256 = sha256(Buffer.from(hex, 'hex'));
        const secondSHA256 = sha256(firstSHA256);
        return Buffer.from(secondSHA256).toString('hex');
    }

    // Convert numbers to big-endian and little-endian byte orders
    hexToLE(hex: string): string {
        if (hex.length % 2 !== 0) {
            throw new Error('Hex string must have an even length');
        }

        const bytes = hex.match(/.{2}/g); // Split into byte pairs
        if (!bytes) return '';

        return bytes.reverse().join('');
    }

    toDER(signature: Uint8Array): Uint8Array {
        if (signature.length !== 64) {
            throw new Error("Invalid signature length");
        }

        const r = signature.slice(0, 32);
        const s = signature.slice(32, 64);

        function trimLeadingZeros(buf: Uint8Array) {
            let i = 0;
            while (i < buf.length - 1 && buf[i] === 0) i++;
            return buf.slice(i);
        }

        function toPositive(buf) {
            if (buf[0] & 0x80) {
            return Buffer.concat([Buffer.from([0x00]), buf]);
            }
            return buf;
        }

        const rTrimmed = toPositive(trimLeadingZeros(r));
        const sTrimmed = toPositive(trimLeadingZeros(s));

        const rLen = rTrimmed.length;
        const sLen = sTrimmed.length;

        const totalLen = 2 + rLen + 2 + sLen;

        return Buffer.concat([
            Buffer.from([0x30, totalLen]),
            Buffer.from([0x02, rLen]),
            rTrimmed,
            Buffer.from([0x02, sLen]),
            sTrimmed,
        ]);
    }

    getCompactSize(i: number): string {
        // convert integer to a hex string with the correct prefix depending on the size of the integer
        if (i <= 252) {
            return this.hexToLE(i.toString(16).padStart(2, '0'));
        } else if (i > 252 && i <= 65535) {
            return 'fd' + this.hexToLE(i.toString(16).padStart(4, '0'));
        } else if (i > 65535 && i <= 4294967295) {
            return 'fe' + this.hexToLE(i.toString(16).padStart(8, '0'));
        } else if (i > 4294967295 && i <= 18446744073709551615n) {
            return 'fe' + this.hexToLE(i.toString(16).padStart(16, '0'));
        }
        return null;
    }
}