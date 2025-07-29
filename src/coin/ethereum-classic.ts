import { input, confirm, select } from '@inquirer/prompts';
import { encode as rlpEncode } from 'rlp';
import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Coin } from './coin';
import * as fs from 'fs/promises';

export class EthereumClassic implements Coin {
    code = 'ETC';
    purpose = '44';
    coin = '61';
    account = '0';
    change = '0';
    helper: Helper;

    private unit = 'gwei/gas';
    private color = '\x1b[38;5;122m';
    private wei = 10 ** 18;
    private gWei = 10 ** 9;

    constructor(helper: Helper) {
        this.helper = helper;
    }

    showKeyInfo(root: BIP32Interface, index: string): void {
        const child = root.derivePath(`m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}`);

        let detail = `-----------m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}-------------------\n`;

        detail += `Private Key: 0x${child.privateKey.toString('hex')}\n`;
        detail += `Public Key: 0x${child.publicKey.toString('hex')}\n`;
        const fullPubKey = this.helper.decompressPublicKey(child.publicKey);
        detail += `Address: ${this.getEthereumAddress(fullPubKey)}\n`;
        detail += '------------------------------------------------\n';

        this.helper.print(this.color, detail);
    }

    async showAddressDetail(xpub: BIP32Interface, accountName: string, index: string): Promise<void> {
        const ck = xpub.derivePath(`${String(this.account)}/${index}`);
        const fullPubKey = this.helper.decompressPublicKey(ck.publicKey);
        const address = this.getEthereumAddress(fullPubKey);

        const addr = await this.getAddr(address);
        this.helper.print(this.color, `|${index}|${address}|${addr.balance / this.wei}`);

        this.helper.updateDb(accountName, index, addr.balance);
    }

    async showUsingAddresses(xpub: BIP32Interface, accountName: string): Promise<void> {
        let total = 0;
        const using_addrs = this.helper.getUsingAddresses(accountName);

        for (const a of using_addrs) {
            const ck = xpub.derivePath(`${String(this.account)}/${a.idx}`);
            const fullPubKey = this.helper.decompressPublicKey(ck.publicKey);
            const address = this.getEthereumAddress(fullPubKey);

            const addr = await this.getAddr(address);
            this.helper.print(this.color, `|${a.idx}|${address}|${addr.balance / this.wei}`);
            total += addr.balance;

            this.helper.updateDb(accountName, a.idx, addr.balance);
        }

        console.log(`Total Balance: ${total / this.wei}`);
    }

    async createTx(): Promise<void> {
        // calculate network fees
        let feeGw = await this.getFee();
        let feeW = feeGw * this.gWei;

        const newFee = await input({ message: `Type new fee if you want to change (${this.unit}): `, default: feeGw.toString(), validate: this.helper.isFloat });
        feeGw = Number(newFee);
        feeW = (feeGw * this.wei) / this.gWei;

        // add input address
        const inputAddr = await input({ message: 'Type input address: ', required: true });
        let inBalance: number;
        let nonce: number;
        let txUint: number;
        const addrObj = await this.getAddr(inputAddr);
        nonce = addrObj.nonce;

        // choose transfer type
        const type = await select({
            message: 'Choose your action: ', choices: [
                { value: 0, name: 'transfer Ethereum Classic' }
            ]
        });
        
        if (type === 0) {
            inBalance = addrObj.balance;
            txUint = this.wei;
        }
        const inObj = { address: inputAddr, balance: inBalance };

        const displayAmt = inBalance / txUint;

        // add output address and amount
        const outputAddr = await input({ message: 'Type output address: ', required: true });

        const balance = await input({ message: 'Type amount: ', required: true, default: displayAmt.toString(), validate: (value) => { return this.helper.validateAmount(value, inBalance); } });

        const outBalance = Number(balance) * txUint;
        const outObj = { address: outputAddr, balance: outBalance };

        console.log('----------------------------------');
        console.log(`transaction fee: ${feeGw} ${this.unit}`);
        console.log('----------------------------------');
        console.log(`transfer Ethereum Classic: ${balance}`);
        console.log(`input addr: ${inObj.address}`);
        console.log(`output addr: ${outObj.address}`);
        console.log('----------------------------------');

        const status = await confirm({ message: 'Continue to create transaction: ' });
        if (status) {
            const tx = { coin: this.code, fee: feeW, nonce: nonce, type: type, input: inputAddr, output: outputAddr, balance: inBalance, amount: outBalance };
            fs.writeFile(this.helper.TX_FILE, JSON.stringify(tx), 'utf8');
        }
    }

    async sign(tx: any): Promise<void> {
        const gas = this.calcGas(tx);
        const feeW = gas * tx['fee'];

        console.log('----------------------------------');
        console.log(`calculated network fee: ${feeW / this.wei} ${this.code}`);
        console.log(`gas: ${gas}`);
        console.log('----------------------------------');

        const pk = await input({ message: `Type private key for address [${tx.input}]: `, required: true });

        let to: string;
        let value: number;
        let txData: Uint8Array;
        const chainId = 61n;
        if (tx['type'] === 0) {
            to = this.helper.strip0x(tx['output']);
            const surplus = tx['amount'] + feeW - tx['balance'];
            value = surplus > 0 ? tx['amount'] - surplus : tx['amount'];
            txData = new Uint8Array([]);
        }

        const commonTx = [
            tx['nonce'],  // nonce
            tx['fee'], // gasPrice
            gas,  // gasLimit
            Buffer.from(to, 'hex'), // to address
            value,  // value
            txData  // data
        ];

        const unsignedTx = [
            ...commonTx,
            chainId, // chainId
            new Uint8Array([]), // empty r
            new Uint8Array([]) // empty s
        ];

        const rlpEncoded = rlpEncode(unsignedTx);
        const messageHash = keccak_256(rlpEncoded);
        const privateKey = this.helper.strip0x(pk);

        const rawSignature = secp256k1.sign(messageHash, privateKey, { lowS: true }); // sig is 64 bytes, recoveryId is v

        const r = rawSignature.r;
        const s = rawSignature.s;
        // EIP-155 v calculation
        const v = BigInt(rawSignature.recovery) + 35n + BigInt(chainId) * 2n;

        const signedTx = [
            ...commonTx,
            v, // v
            r, // r
            s // s
        ];

        const signedRlp = rlpEncode(signedTx);
        const raw = `0x${Buffer.from(signedRlp).toString('hex')}`; // EIP-155 format

        fs.writeFile(this.helper.SIG_TX_FILE, raw, 'utf8');
        console.log(raw);
    }

    private async getAddr(address: string): Promise<any> {
        let resp = await this.helper.api.get(`https://etc.blockscout.com/api/v2/addresses/${address}`);
        const balance = resp.data['coin_balance'];
        resp = await this.helper.api.get(`https://etc.blockscout.com/api/v2/addresses/${address}/transactions`);
        const txs: any[] = resp.data['items'];
        const nonce = txs.filter(t => t['from']['hash'].toLowerCase() === address.toLowerCase()).length;
        return { balance: Number(balance), nonce: nonce };
    }

    private async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://etc.blockscout.com/api/v2/stats`);
        return resp.data['gas_prices']['average'];
    }

    private getEthereumAddress(publicKey: Uint8Array): string {
        // Assume `publicKey` is a Uint8Array of 64 bytes (no 0x04 prefix)
        publicKey = publicKey.slice(1);
        const hash = keccak_256(publicKey); // returns Uint8Array
        return '0x' + Buffer.from(hash.slice(-20)).toString('hex');
    }

    private calcGas(tx: any): number {
        let size: number;
        if (tx.type === 0) {
            // Ethereum Classic transfer
            size = 21000;
        }
        return size;
    }
}