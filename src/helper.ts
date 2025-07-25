import { select } from '@inquirer/prompts';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { sha256 } from '@noble/hashes/sha2';
import { base58 } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Database } from 'better-sqlite3';
import DatabaseInstance = require('better-sqlite3');
import { SocksProxyAgent } from 'socks-proxy-agent';
import { aes256gcmDecode } from './aes';
import { Coin } from './coin/coin';
import { Bitcoin } from './coin/bitcoin';
import { BitcoinSV } from './coin/bitcoin-sv';
import { BitcoinCash } from './coin/bitcoin-cash';
import { Ethereum } from './coin/ethereum';
import { EthereumClassic } from './coin/ethereum-classic';
import { Dogecoin } from './coin/dogecoin';
import { Monero } from './coin/monero';
import { Tron } from './coin/tron';

export class Helper {

    api: AxiosInstance;
    coinRegistry: Coin[] = [];
    DB_FILE = 'acc.db';
    TX_FILE = 'tx';
    SIG_TX_FILE = 'sigtx';
    db: Database;

    constructor() {
        this.coinRegistry.push(new Bitcoin(this));
        this.coinRegistry.push(new Ethereum(this));
        this.coinRegistry.push(new BitcoinSV(this));
        this.coinRegistry.push(new BitcoinCash(this));
        this.coinRegistry.push(new EthereumClassic(this));
        this.coinRegistry.push(new Dogecoin(this));
        this.coinRegistry.push(new Monero(this));
        this.coinRegistry.push(new Tron(this));
    }

    async initResource(): Promise<void> {
        // init db
        const fs = require('fs');
        if (fs.existsSync(this.DB_FILE)) {
            this.db = new DatabaseInstance(this.DB_FILE);
        }

        // init network
        const config: AxiosRequestConfig = {};
        config.headers = { 'Content-Type': 'application/json' };
        config.validateStatus = () => true;
        try {
            const url = 'https://www.google.com';
            await fetch(url, { method: 'HEAD', mode: 'no-cors' });
            // For 'no-cors' mode, we can't inspect the response status directly,
            // but a successful fetch indicates a connection.
            // If you can use 'cors' mode, you can check response.ok or response.status.
            this.api = axios.create(config);
        } catch (error) {
            // this is used when testing with GFW. a lot of websites are blocked.
            // need a socks5 proxy server to bypass the GFW.
            const proxy = 'socks5h://127.0.0.1:1080';
            const agent = new SocksProxyAgent(proxy);
            config.httpAgent = agent;
            config.httpsAgent = agent;
            this.api = axios.create(config);
        }

        this.coinRegistry.forEach(c => {
            c.init();
        });
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
        console.log(`Current coin is: [${coinName}]`);
        console.log('----------------------------------');

        return this.getCoinInstance(coinName);
    }

    getCoinInstance(coinName: string): Coin {
        return this.coinRegistry.find(c => c.code === coinName);
    }

    getAPIKey(name: string): string {
        const stmt = this.db.prepare('select * from t_apikey where name = ?');
        const row: any = stmt.get(name);
        return aes256gcmDecode(Buffer.from(row.key, 'hex'), name).toString('utf8');
    }

    getAllAccounts(): any {
        const stmt = this.db.prepare('select * from t_account');
        const accounts = stmt.all();
        for (const acc of accounts) {
            acc['pub_key'] = aes256gcmDecode(Buffer.from(acc['pub_key'], 'hex'), acc['name']).toString('utf8');
        }
        return accounts;
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

    validateAmount(value: string, remainAmt: number): boolean {
        return this.isFloat(value) && Number(value) <= remainAmt;
    }

    destroy(): void {
        this.db.close();
    }

    // Double SHA-256
    hash256(hex: string): string {
        const doubleSha = sha256(sha256(Buffer.from(hex, 'hex')));
        return Buffer.from(doubleSha).toString('hex');
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

    // Convert to compact size of a number
    getCompactSize(i: number): string {
        // convert integer to a hex string with the correct prefix depending on the size of the integer
        if (i <= 252) {
            return this.hexToLE(i.toString(16).padStart(2, '0'));
        } else if (i > 252 && i <= 65535) {
            return `fd${this.hexToLE(i.toString(16).padStart(4, '0'))}`;
        } else if (i > 65535 && i <= 4294967295) {
            return `fe${this.hexToLE(i.toString(16).padStart(8, '0'))}`;
        } else if (i > 4294967295 && i <= 18446744073709551615n) {
            return `ff${this.hexToLE(i.toString(16).padStart(16, '0'))}`;
        }
        return null;
    }

    // Convert big int value to uint8array
    bigintToUint8Array(bn: bigint): Uint8Array {
        const bytes: number[] = [];

        let v = bn;
        while (v > 0n) {
            bytes.push(Number(v & 0xffn));
            v >>= 8n;
        }

        const result = new Uint8Array(bytes);
        return result.reverse();
    }

    // Convert uint8array to big int value
    uint8ArrayToBigInt(bytes: Uint8Array): bigint {
        let result = 0n;
        for (const byte of bytes) {
            result = (result << 8n) + BigInt(byte);
        }
        return result;
    }

    // format output with color
    print(color: string, text: string): void {
        console.log(color + text + '\x1b[0m');
    }

    // decompress a compressed public key
    decompressPublicKey(compressed: Uint8Array): Uint8Array {
        const point = secp256k1.Point.fromBytes(compressed);
        return point.toBytes(false);
    }

    strip0x(s: string): string {
        return s.startsWith('0x') ? s.slice(2) : s;
    }

    // bs58check implementation
    bs58Enc(hashHex: string): string {
        // double sha256
        const hash256 = this.hash256(hashHex);
        // first 4 bytes is the checksum
        const checksum = hash256.substring(0, 8);
        // calculate the bigint
        const decimal = BigInt("0x" + hashHex + checksum);
        return base58.encode(this.bigintToUint8Array(decimal));
    }

    bs58Dec(address: string): string {
        const val = base58.decode(address);
        const decimal = this.uint8ArrayToBigInt(val);
        const hex = decimal.toString(16);
        return hex.slice(0, -8);
    }
}