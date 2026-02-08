import { BIP32Interface } from "bip32";
import { Helper } from "../helper";
import { Blockchain } from "./blockchain";
import { keccak_256 } from "@noble/hashes/sha3";

export class Tron implements Blockchain {
    chain = 'Tron';
    token = 'TRX';
    purpose = '44';
    coin = '195';
    account = '0';
    change = '0';
    color = '196';
    helper: Helper;

    private unit = 'suns/gas';
    private suns = 10n ** 6n;
    private supportedTokens = [
        { name: 'USDT', contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 10n ** 6n }
    ];

    constructor(helper: Helper) {
        this.helper = helper;
    }

    showKeyInfo(root: BIP32Interface, index: string): void {
        const child = root.derivePath(`m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}`);

        let detail = `-----------m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}-------------------\n`;

        detail += `Private Key: ${child.privateKey?.toString('hex')}\n`;
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

        const addr = await this.getAddrDetail(address);
        this.helper.print(this.color, `|${index}|${address}|${this.helper.bigIntDivide(addr.balance, this.suns)}`);

        this.helper.print(this.color, `---------------------${this.chain} TRC20---------------------`);
        addr.tokens.forEach((token: { address: string; value: bigint; unit: bigint; name: string; }) => {
            this.helper.updateToken(accountName, index, token.address, this.helper.bigIntDivide(token.value, token.unit), token.name);
            this.helper.print(this.color, `|${token.name}|${token.address}|${this.helper.bigIntDivide(token.value, token.unit)}`);
        });

        this.helper.updateDb(accountName, index, this.helper.bigIntDivide(addr.balance, this.suns));
    }

    async showUsingAddresses(xpub: BIP32Interface, accountName: string): Promise<void> {
        let total = 0n;
        const usingAddrs = this.helper.getUsingAddresses(accountName);

        for (const a of usingAddrs) {
            await this.helper.sleep(500);
            const ck = xpub.derivePath(`${String(this.account)}/${a.idx}`);
            const fullPubKey = this.helper.decompressPublicKey(ck.publicKey);
            const address = this.getTronAddress(fullPubKey);

            const addr = await this.getAddrDetail(address);
            this.helper.print(this.color, `|${a.idx}|${address}|${this.helper.bigIntDivide(addr.balance, this.suns)}|${addr.tokens.map((t: { name: any; }) => t.name).join(',')}`);
            total += addr.balance;

            this.helper.updateDb(accountName, a.idx, this.helper.bigIntDivide(addr.balance, this.suns));
        }

        console.log(`Total Balance: ${this.helper.bigIntDivide(total, this.suns)}`);
    }

    createTx(): void {
        console.log('Not support yet');
    }

    sign(tx: any): void {
        console.log('Not support yet');
    }

    private getTronAddress(publicKey: Uint8Array): string {
        // Assume `publicKey` is a Uint8Array of 64 bytes (no 0x04 prefix)
        publicKey = publicKey.slice(1);
        const hash = keccak_256(publicKey); // returns Uint8Array
        const prefix = '41';
        const hashHex = Buffer.from(hash.slice(-20)).toString('hex');
        return this.helper.bs58Enc(prefix + hashHex);
    }

    private async getAddrDetail(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://api.trongrid.io/v1/accounts/${address}`);
        const data = resp.data['data'][0];
        const balance = data && data['balance'] ? BigInt(data['balance']) : 0n;
        const trc20: any[] = data && data['trc20'] ? data['trc20'] : [];

        // TRC20 tokens
        const tokens = [];
        for (const token of this.supportedTokens) {
            let value = 0n;
            for (const t of trc20) {
                for (const key in t) {
                    if (key === token.contract) {
                        value = t[key];
                        break;
                    }
                }
            }
            tokens.push({ name: token.name, address: token.contract, value: BigInt(value), unit: token.decimals });
        }
        return { balance: balance, tokens: tokens };
    }
}