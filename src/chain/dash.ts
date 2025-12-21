import { input, confirm, password } from '@inquirer/prompts';
import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Blockchain } from './blockchain';
import * as fs from 'fs/promises';

export class Dash implements Blockchain {
    chain = 'Dash';
    token = 'DASH';
    purpose = '44';
    coin = '5';
    account = '0';
    change = '0';
    color = '33';
    helper: Helper;

    private unit = 'duff/byte';
    private koinu = 10 ** 8;

    constructor(helper: Helper) {
        this.helper = helper;
    }

    showKeyInfo(root: BIP32Interface, index: string): void {
        const child = root.derivePath(`m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}`);

        let detail = `-----------m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}-------------------\n`;

        detail += `Private Key: ${child.privateKey.toString('hex')}\n`;
        detail += `Public Key: ${child.publicKey.toString('hex')}\n`;
        detail += `Address: ${this.getDashAddress(child.identifier)}\n`;
        detail += `WIF: ${this.pkToWIF(child.privateKey)}\n`;
        detail += '------------------------------------------------\n';

        this.helper.print(this.color, detail);
    }

    async showAddressDetail(xpub: BIP32Interface, accountName: string, index: string): Promise<void> {
        const ck = xpub.derivePath(`${String(this.account)}/${index}`);
        const address = this.getDashAddress(ck.identifier);

        const addr = await this.getAddr(address);
        this.helper.print(this.color, `|${index}|${address}|${addr.balance / this.koinu}|${addr.spentFlag}`);

        const utxos = await this.getUtxos(address);
        this.helper.print(this.color, '---------------------UTXO---------------------');
        utxos.forEach(utxo => this.helper.print(this.color, `|${utxo.vout}|${utxo.txid}|${utxo.value}`));

        this.helper.updateDb(accountName, index, (addr.balance + addr.unBalance) / this.koinu);
    }

    async showUsingAddresses(xpub: BIP32Interface, accountName: string): Promise<void> {
        let total = 0;
        const using_addrs = this.helper.getUsingAddresses(accountName);

        for (const a of using_addrs) {
            const ck = xpub.derivePath(`${String(this.account)}/${a.idx}`);
            const address = this.getDashAddress(ck.identifier);

            const addr = await this.getAddr(address);
            this.helper.print(this.color, `|${a.idx}|${address}|${addr.balance / this.koinu}|${addr.spentFlag}`);
            total += addr.balance;

            this.helper.updateDb(accountName, a.idx, (addr.balance + addr.unBalance) / this.koinu);
        }

        console.log(`Total Balance: ${total / this.koinu}`);
    }

    async createTx(): Promise<void> {
        let totalInput = 0;
        let totalOutput = 0;
        let changeAddr: any;
        const inputAddrs = [];
        const outputAddrs = [];

        // calculate network fees
        let feeVb = await this.getFee();

        const newFee = await input({ message: `Type new fee if you want to change (${this.unit}): `, default: feeVb.toString(), validate: this.helper.isFloat });
        feeVb = Number(newFee);

        // add input address
        while (true) {
            const addr = await input({ message: 'Type input address: ', required: true });
            const addrObj = await this.getAddr(addr);
            const balance = addrObj.balance;
            totalInput += balance;

            const inputAddr = { address: addr, balance: balance };
            inputAddrs.push(inputAddr);

            const status = await confirm({ message: 'Continue to add input address: ' });
            if (!status) {
                break;
            }
        }

        // add output address and amount
        while (true) {
            const remainAmt = totalInput - totalOutput;
            const addr = await input({ message: 'Type output address: ', required: true });
            const balance = await input({ message: 'Type amount: ', required: true, default: (remainAmt / this.koinu).toString(), validate: (value) => { return this.helper.validateAmount(value, remainAmt); } });

            const realBal = Math.round(Number(balance) * this.koinu);
            totalOutput += realBal;

            const outputAddr = { address: addr, balance: realBal };
            outputAddrs.push(outputAddr);

            if (totalInput === totalOutput) {
                break;
            }            

            const status = await confirm({ message: 'Continue to add output address: ' });
            if (!status) {
                break;
            }
        }

        // add change address and amount
        if (totalInput > totalOutput) {
            changeAddr = { address: inputAddrs[inputAddrs.length - 1].address, balance: totalInput - totalOutput };
        }

        console.log('----------------------------------');
        console.log(`transaction fee: ${feeVb} ${this.unit}`);
        console.log('----------------------------------');

        inputAddrs.forEach(addr => console.log(`input addr: ${addr.address}|${addr.balance / this.koinu}`));
        outputAddrs.forEach(addr => console.log(`output addr: ${addr.address}|${addr.balance / this.koinu}`));
        if (changeAddr) {
            console.log(`change addr: ${changeAddr.address}|${changeAddr.balance / this.koinu}`);
        }

        console.log('----------------------------------');

        const status = await confirm({ message: 'Continue to create transaction: ' });
        if (status) {
            const tx = { coin: this.coin, fee: feeVb, inputs: [], outputs: [] };

            // create input from utxos
            for (const addr of inputAddrs) {
                const utxos = await this.getUtxos(addr.address);
                const inputs = utxos.map(u => {
                    return { txid: u['txid'], vout: u['vout'], address: addr.address, value: u['value'] };
                });
                tx.inputs.push(...inputs);
            }

            // create output from outputAddrs
            const outputs = outputAddrs.map(addr => {
                return { address: addr.address, amount: addr.balance, change: false };
            });
            tx.outputs.push(...outputs);

            // create output from changeAddr if have
            if (changeAddr) {
                tx.outputs.push({ address: changeAddr.address, amount: changeAddr.balance, change: true });
            } else {
                tx.outputs[tx.outputs.length - 1].change = true;
            }

            fs.writeFile(this.helper.TX_FILE, JSON.stringify(tx), 'utf8');
        }
    }

    async sign(tx: any): Promise<void> {
        const size = this.calcSize(tx);
        const fee = Math.ceil(size * tx['fee']); // calculated fee

        console.log('----------------------------------');
        console.log(`calculated fee: ${fee / this.koinu} ${this.token}`);
        console.log(`size: ${size} bytes`);
        console.log('----------------------------------');

        // loop all input and get all addresses
        // remove duplicate addresses
        const addresses = new Set<string>();
        for (const addr of tx['inputs']) {
            addresses.add(addr['address']);
        }

        // collect pk and associated to address
        const keyMap = new Map<string, string>();
        for (const address of addresses) {
            const pk = await password({ message: `Type private key for address [${address}]: `, mask: '*' });
            keyMap.set(address, pk);
        }

        let raw = '';

        const version = '01000000';
        const locktime = '00000000';

        raw += version; // version

        raw += this.helper.getCompactSize(tx['inputs'].length); // inputcount
        const sequence = 'fdffffff'; // sequence, enable RBF
        for (const input of tx['inputs']) {
            const txId = this.helper.hexToLE(input['txid']); // txid, must be Reverse Byte Order
            const vout = this.helper.hexToLE(input['vout'].toString(16).padStart(8, '0')); // vout

            raw += txId + vout;
            raw += `{${input['txid']}}`; // scriptsig size and scriptsig, set placeholder here
            raw += sequence;         
        }

        raw += this.helper.getCompactSize(tx['outputs'].length); // outputcount
        for (const output of tx['outputs']) {
            const scriptPubkey = `76a914${this.getHash160Legacy(output['address'])}88ac`;; // scriptpubkey
            const keySize = this.helper.getCompactSize(scriptPubkey.length / 2); // scriptpubkeysize
            const finalAmt = output['change'] ? output['amount'] - fee : output['amount']; // output with change flag will deduct network fee
            let amount = this.helper.hexToLE(finalAmt.toString(16).padStart(16, '0')); // amount

            raw += amount + keySize + scriptPubkey;
        }

        raw += locktime; // locktime

        // calculate and update signature part of tx
        const preimage = raw; // clone the current raw string
        for (const input of tx['inputs']) {
            const privateKey = keyMap.get(input['address']);

            const rawSignature = secp256k1.sign(this.getPreimageLagacy(preimage, input), privateKey, { lowS: true });
            const signature = `${rawSignature.toDERHex()}01`; // DER Sign + SIGHASH_ALL (0x01)
            const sigSize = this.helper.getCompactSize(signature.length / 2); // signature size

            const publicKey = Buffer.from(secp256k1.getPublicKey(privateKey)).toString('hex');
            const publicKeySize = this.helper.getCompactSize(publicKey.length / 2); // publicKey size

            const scriptSig = sigSize + signature + publicKeySize + publicKey;
            const scriptSigSize = this.helper.getCompactSize(scriptSig.length / 2);

            raw = raw.replace(`{${input['txid']}}`, scriptSigSize + scriptSig);
        }

        fs.writeFile(this.helper.SIG_TX_FILE, raw, 'utf8');
        console.log(raw);
    }

    private async getAddr(address: string): Promise<any> {
        let resp = await this.helper.api.get(`https://api.blockcypher.com/v1/dash/main/addrs/${address}/balance`);
        const balance = resp.data['balance'];
        const unBalance = resp.data['unconfirmed_balance'];
        const isSpent = resp.data['total_sent'] > 0;
        const spentFlag = isSpent ? "✘" : "✔";

        return { balance: balance, unBalance: unBalance, spentFlag: spentFlag };
    }

    private async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://api.blockcypher.com/v1/dash/main/addrs/${address}?unspentOnly=1&limit=100`);
        const utxos = [];
        if (resp.data['txrefs']) {
            resp.data['txrefs'].forEach(utxo => {
                utxos.push({ txid: utxo['tx_hash'], vout: utxo['tx_output_n'], value: utxo['value'] });
            });
        }
        return utxos;
    }

    private async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://api.blockcypher.com/v1/dash/main`);
        return resp.data['low_fee_per_kb'] / 1000;
    }

    private getDashAddress(hash160: Buffer): string {
        const prefix = '4c';
        const hash160Hex = hash160.toString('hex');
        return this.helper.bs58Enc(prefix + hash160Hex);
    }

    private getHash160Legacy(address: `D${string}`): string {
        return this.helper.bs58Dec(address).slice(2);
    }

    private getPreimageLagacy(preimage: string, input: any[]): Buffer<ArrayBuffer> {
        const scriptSig = `76a914${this.getHash160Legacy(input['address'])}88ac`;
        const scriptSigSize = this.helper.getCompactSize(scriptSig.length / 2);

        // put the ScriptPubKey from the output we want to spend into the ScriptSig of our input
        preimage = preimage.replace(`{${input['txid']}}`, scriptSigSize + scriptSig);
        // Remove existing ScriptSigs for other inputs
        preimage = preimage.replace(/\{[^}]*\}/g, '00');
        // Add signature hash type to the end of the hash preimage
        preimage += '01000000'; // SIGHASH_ALL
        // Hash the preimage
        preimage = this.helper.hash256(preimage);

        return Buffer.from(preimage, 'hex');
    } 

    private calcSize(tx: any): number {
        let size = 4; // Version
        const inputTotal = this.helper.getCompactSize(tx['inputs'].length);
        size += tx['inputs'].length * ((inputTotal.length / 2) + 32 + 4 + 1 + (1 + 72 + 1 + 33) + 4);
        const outputTotal = this.helper.getCompactSize(tx['outputs'].length);
        size += tx['outputs'].length * ((outputTotal.length / 2) + 8 + 1 + 25);
        size += 4; // locktime
        return size;
    }

    private pkToWIF(privKey: Buffer): string {
        if (privKey.length !== 32) {
            throw new Error('Private key must be 32 bytes (64 hex characters)');
        }
        // 0xCC = 204 = Dash mainnet private key prefix
        const prefix = 'cc';
        const privKeyHex = `${privKey.toString('hex')}01`;
        return this.helper.bs58Enc(prefix + privKeyHex);
    }      
}