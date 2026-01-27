import { select } from '@inquirer/prompts';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { sha256 } from '@noble/hashes/sha2';
import { base58 } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Database } from 'better-sqlite3';
import DatabaseInstance = require('better-sqlite3');
import { SocksProxyAgent } from 'socks-proxy-agent';
import { aes256gcmDecode, aes256gcmEncode } from './aes';
import { Blockchain } from './chain/blockchain';
import { Bitcoin } from './chain/bitcoin';
import { BitcoinCash } from './chain/bitcoin-cash';
import { Ethereum } from './chain/ethereum';
import { EthereumClassic } from './chain/ethereum-classic';
import { Dogecoin } from './chain/dogecoin';
import { Polygon } from './chain/polygon';
import { Optimism } from './chain/optimism';
import { Arbitrum } from './chain/arbitrum';
import { Litecoin } from './chain/litecoin';
import { Monero } from './chain/monero';
import { Dash } from './chain/dash';
import { DigiByte } from './chain/digi-byte';

export class Helper {

    api: AxiosInstance;
    chainRegistry: Blockchain[] = [];
    DB_FILE = 'acc.db';
    TX_FILE = 'tx';
    SIG_TX_FILE = 'sigtx';
    COST_NAME = 'cost';
    db: Database;

    constructor() {
        this.chainRegistry.push(new Bitcoin(this));
        this.chainRegistry.push(new Litecoin(this));
        this.chainRegistry.push(new Dogecoin(this));
        this.chainRegistry.push(new BitcoinCash(this));
        this.chainRegistry.push(new Dash(this));
        this.chainRegistry.push(new DigiByte(this));
        this.chainRegistry.push(new Monero(this));
        this.chainRegistry.push(new Ethereum(this));
        this.chainRegistry.push(new EthereumClassic(this));
        this.chainRegistry.push(new Polygon(this));
        this.chainRegistry.push(new Optimism(this));
        this.chainRegistry.push(new Arbitrum(this));
    }

    async initResource(): Promise<void> {
        // init db
        const fs = require('fs');
        if (fs.existsSync(this.DB_FILE)) {
            this.db = new DatabaseInstance(this.DB_FILE);
        }

        // init network
        const config: AxiosRequestConfig = {};
        config.headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Type': 'application/json'
        };
        config.validateStatus = () => true;

        if (process.env.APP_STAGE !== 'prd') {
            const agent = new SocksProxyAgent('socks5h://127.0.0.1:1080');
            config.httpAgent = agent;
            config.httpsAgent = agent;
        }

        this.api = axios.create(config);
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

    async chooseChain(): Promise<Blockchain> {
        const blockchain: Blockchain = await select({
            message: 'Choose Blockchain: ', choices: this.chainRegistry.map(t => {
                return { value: t, name: t.chain };
            })
        });

        console.log('----------------------------------');
        console.log(`Current Blockchain is: [${blockchain.chain}]`);
        console.log('----------------------------------');

        return blockchain;
    }

    getBlockchain(coinType: string): Blockchain {
        return this.chainRegistry.find(c => c.coin === coinType);
    }

    getAllAccounts(): any {
        const stmt = this.db.prepare('select * from t_account');
        const accounts = stmt.all();
        for (const acc of accounts) {
            acc['pub_key'] = aes256gcmDecode(Buffer.from(acc['pub_key'], 'hex'), acc['name']).toString('utf8');
        }
        return accounts;
    }

    aggAllAccounts(): any[] {
        const stmt = this.db.prepare('select sum(a.balance) balance, a.name, b.coin_type from t_address a inner join t_account b on a.name = b.name group by a.name');
        return stmt.all();
    }

    aggAllTokens(): any[] {
        const stmt = this.db.prepare('select sum(balance) balance, name, contract, symbol from t_token group by name, contract');
        return stmt.all();
    }

    addAccount(name: string, pubKey: string, coinType: string): void {
        const stmt = this.db.prepare('insert into t_account (name, pub_key, coin_type) values (?, ?, ?)');
        pubKey = aes256gcmEncode(Buffer.from(pubKey, 'utf8'), name).toString('hex');
        stmt.run(name, pubKey, coinType);
    }

    deleteAccount(name: string): void {
        const stmt = this.db.prepare('delete from t_account where name = ?');
        stmt.run(name);
    }

    getCost(): number {
        const stmt = this.db.prepare('select balance from t_address where name = ?');
        const obj = stmt.get(this.COST_NAME);
        let cost: number;
        if (!obj) {
            const stmtInsert = this.db.prepare('insert into t_address (name, idx, balance) values (?, ?, ?)');
            stmtInsert.run(this.COST_NAME, 0, 0);
            cost = 0;
        } else {
            cost = obj['balance'];
        }
        return Number(cost);
    }

    updateCost(value: number, append: boolean): void {
        const sql = append ? 'update t_address set balance = balance + ? where name = ?' : 'update t_address set balance = ? where name = ?';
        const stmt = this.db.prepare(sql);
        stmt.run(value, this.COST_NAME);
    }

    getUsingAddresses(accountName: string): any {
        const stmt = this.db.prepare('select * from t_address where name = ? and balance > ?');
        return stmt.all(accountName, 0);
    }

    updateToken(accountName: string, i: string, contract: string, value: string, tokenName: string): void {
        if (Number(value) === 0) {
            const stmt = this.db.prepare('delete from t_token where name = ? and idx = ? and contract = ?');
            stmt.run(accountName, Number(i), contract);
        } else {
            const stmt = this.db.prepare('insert into t_token (name, idx, contract, balance, symbol) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name, idx, contract) DO UPDATE SET balance = excluded.balance');
            stmt.run(accountName, Number(i), contract, value, tokenName);
        }
    }

    updateDb(accountName: string, i: string, value: string): void {
        if (Number(value) === 0) {
            const stmt = this.db.prepare('delete from t_address where name = ? and idx = ?');
            stmt.run(accountName, Number(i));
        } else {
            const stmt = this.db.prepare('insert into t_address (name, idx, balance) VALUES (?, ?, ?) ON CONFLICT(name, idx) DO UPDATE SET balance = excluded.balance');
            stmt.run(accountName, Number(i), value);
        }
    }

    validateAmount(value: string, remainAmt: string): boolean {
        return this.isFloat(value) && this.decimalToBigInt(value, 18) <= this.decimalToBigInt(remainAmt, 18);
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
        console.log(`\x1b[38;5;${color}m${text}\x1b[0m`);
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
        const decimal = BigInt('0x' + hashHex + checksum);
        return base58.encode(this.bigintToUint8Array(decimal));
    }

    bs58Dec(address: string): string {
        const val = base58.decode(address);
        const decimal = this.uint8ArrayToBigInt(val);
        const hex = decimal.toString(16);
        return hex.slice(0, -8);
    }

    bigIntDivide(a: bigint, b: bigint): string {
        const decimals = b.toString().length - 1;
        return (
            a / b +
            '.' +
            (a % b).toString().padStart(decimals, '0')
        );
    }

    bigIntMultiply(decimalStr: string, a: bigint): bigint {
        const [intPart, fracPart = ''] = decimalStr.split('.');
        const scale = 10n ** BigInt(fracPart.length);

        const decimalBigInt =
            BigInt(intPart + fracPart);   // '0' + '21222' → 21222n

        return (decimalBigInt * a) / scale;
    }

    decimalToBigInt(value: string, decimals: number): bigint {
        const [i, d = ''] = value.split('.');
        return BigInt(i + d.padEnd(decimals, '0'));
    }
}