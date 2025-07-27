import { input, confirm, select } from '@inquirer/prompts';
import { encode as rlpEncode } from 'rlp';
import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Coin } from './coin';
import * as fs from 'fs/promises';

export class Tron implements Coin {
    code = 'TRX';
    purpose = '44';
    coin = '195';
    account = '0';
    change = '0';
    helper: Helper;

    private unit = 'suns/gas';
    private color = '\x1b[38;5;196m';
    private suns = 10 ** 6;
    private trc20Tokens = [
        { name: 'USDT', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 10 ** 6 }
    ];
    private apiKey: string;

    constructor(helper: Helper) {
        this.helper = helper;
    }

    init(): void {
        this.apiKey = this.helper.getAPIKey('trongrid');
    }

    showKeyInfo(root: BIP32Interface, index: string): void {
        const child = root.derivePath(`m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}`);

        let detail = `-----------m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}-------------------\n`;

        detail += `Private Key: ${child.privateKey.toString('hex')}\n`;
        detail += `Public Key: ${child.publicKey.toString('hex')}\n`;
        const fullPubKey = this.helper.decompressPublicKey(child.publicKey);
        detail += `Address: ${this.getTronAddress(fullPubKey)}\n`;
        detail += '------------------------------------------------\n';

        this.helper.print(this.color, detail);
    }

    async showAddressDetail(xpub: BIP32Interface, accountName: string, index: string): Promise<void> {
        const ck = xpub.derivePath(`${String(this.account)}/${index}`);
        const fullPubKey = this.helper.decompressPublicKey(ck.publicKey);
        const address = this.getTronAddress(fullPubKey);

        const addr = await this.getAddr(address);
        this.helper.print(this.color, `|${index}|${address}|${addr.balance / this.suns}`);

        const tokens = addr.trc20;
        this.helper.print(this.color, '---------------------TRC20---------------------');
        tokens.forEach(token => this.helper.print(this.color, `|${token.name}|${token.value / token.unit}`));

        this.helper.updateDb(accountName, index, addr.balance);
    }

    async showUsingAddresses(xpub: BIP32Interface, accountName: string): Promise<void> {
        let total = 0;
        const using_addrs = this.helper.getUsingAddresses(accountName);

        for (const a of using_addrs) {
            const ck = xpub.derivePath(`${String(this.account)}/${a.idx}`);
            const fullPubKey = this.helper.decompressPublicKey(ck.publicKey);
            const address = this.getTronAddress(fullPubKey);

            const addr = await this.getAddr(address);
            this.helper.print(this.color, `|${a.idx}|${address}|${addr.balance / this.suns}`);
            total += addr.balance;

            this.helper.updateDb(accountName, a.idx, addr.balance);
        }

        console.log(`Total Balance: ${total / this.suns}`);
    }

    async createTx(): Promise<void> {
        console.log('Not support yet');
    }

    async sign(tx: any): Promise<void> {
        console.log('Not support yet');
    }

    private async getAddr(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://api.trongrid.io/v1/accounts/${address}`);
        const data = resp.data['data'][0];
        const balance = data ? data['balance'] : 0;
        const trc20: any[] = data ? data['trc20'] : [];

        // TRC20 tokens
        const tokens = [];
        for (const token of this.trc20Tokens) {
            let value = 0;
            for (const t of trc20) {
                for (const key in t) {
                    if (key === token.address) {
                        value = t[key];
                        break;
                    }
                }
            }
            tokens.push({ name: token.name, value: value, unit: token.decimals });
        }
        return { balance: balance, trc20: tokens };
    }

    private getTronAddress(publicKey: Uint8Array): string {
        // Assume `publicKey` is a Uint8Array of 64 bytes (no 0x04 prefix)
        publicKey = publicKey.slice(1);
        const hash = keccak_256(publicKey); // returns Uint8Array
        const prefix = '41';
        const hashHex = Buffer.from(hash.slice(-20)).toString('hex');
        return this.helper.bs58Enc(prefix + hashHex);
    }
}