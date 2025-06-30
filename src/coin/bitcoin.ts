import { input, confirm } from '@inquirer/prompts';
import { bech32 } from '@scure/base';
import * as wif from 'wif';
import { Helper } from '../helper';
import { BIP32Factory, BIP32Interface } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { Coin } from './coin';
import * as fs from 'fs/promises';

export class Bitcoin implements Coin {
    code = 'BTC';
    purpose = '84';
    coin = '0';
    account = '0';
    change = '0';
    helper: Helper;

    private unit = 'sat/vB';
    private txFile = 'tx';
    private signFile = 'signed_tx';
    private color = '\x1b[38;5;214m';

    constructor(helper: Helper) {
        this.helper = helper;
    }

    showKeyInfo(root: BIP32Interface, index: string): void {
        const child = root.derivePath('m/' + this.purpose + '\'/' + this.coin + '\'/' + this.account + '\'/' + this.change + '/' + index);

        let detail = '-----------m/' + this.purpose + '\'/' + this.coin + '\'/' + this.account + '\'/' + this.change + '/' + index + '-------------------\n';

        detail += 'WIF: ' + child.toWIF() + '\n';
        detail += 'Private Key: ' + child.privateKey.toString('hex') + '\n';
        detail += 'Public Key: ' + child.publicKey.toString('hex') + '\n';
        detail += 'Segwit Address: ' + this.getSigwitAddress(child.identifier) + '\n';
        detail += '------------------------------------------------\n';

        this.helper.print(this.color, detail);
    }

    async showAddressDetail(xpub: BIP32Interface, accountName: string, index: string): Promise<void> {
        const ck = xpub.derivePath(String(this.account) + '/' + index);
        const address = this.getSigwitAddress(ck.identifier);

        const addr = await this.getAddr(address);
        this.helper.print(this.color, '|' + index + '|' + address + '|' + (addr.balance / 100000000) + '|' + addr.spentFlag);

        const utxos = await this.getUtxos(address);
        utxos.forEach(utxo => console.log(utxo));

        this.helper.updateDb(accountName, index, addr.balance + addr.unBalance);
    }

    async showUsingAddresses(xpub: BIP32Interface, accountName: string): Promise<void> {
        let total = 0;
        const using_addrs = this.helper.getUsingAddresses(accountName);

        for (const a of using_addrs) {
            const ck = xpub.derivePath(String(this.account) + '/' + a.idx);
            const address = this.getSigwitAddress(ck.identifier);

            const addr = await this.getAddr(address);
            this.helper.print(this.color, '|' + a.idx + '|' + address + '|' + (addr.balance / 100000000) + '|' + addr.spentFlag);
            total += addr.balance;

            this.helper.updateDb(accountName, a.idx, addr.balance + addr.unBalance);
        }

        console.log('Total Balance:' + (total / 100000000));
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
            const balance = await input({ message: 'Type amount: ', required: true, default: (remainAmt / 100000000).toString(), validate: (value) => { return this.helper.validateAmount(value, remainAmt); } });

            const realBal = Math.round(Number(balance) * 100000000);
            totalOutput += realBal;

            const outputAddr = { address: addr, balance: realBal };
            outputAddrs.push(outputAddr);

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
        console.log('transaction fee: ' + feeVb + ' ' + this.unit);
        console.log('----------------------------------');

        inputAddrs.forEach(addr => console.log('input addr: ' + addr.address + '|' + addr.balance / 100000000));
        outputAddrs.forEach(addr => console.log('output addr: ' + addr.address + '|' + addr.balance / 100000000));
        if (changeAddr) {
            console.log('change addr: ' + changeAddr.address + '|' + changeAddr.balance / 100000000);
        }

        console.log('----------------------------------');

        const status = await confirm({ message: 'Continue to create transaction: ' });
        if (status) {
            const tx = { fee: feeVb, inputs: [], outputs: [] };

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

            fs.writeFile(this.txFile, JSON.stringify(tx), 'utf8');
        }
    }

    async sign(): Promise<void> {
        const bip32 = BIP32Factory(ecc);
        const data = await fs.readFile(this.txFile, 'utf8');
        const tx = JSON.parse(data);
        const vSize = this.calcVSize(tx);
        const fee = Math.ceil(vSize * tx['fee']); // calculated fee

        console.log('----------------------------------');
        console.log('calculated fee: ' + fee + ' ' + this.unit);
        console.log('vSize: ' + vSize + ' vbytes');
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
            const pk = await input({ message: `Type WIF private key for address [${address}]: `, required: true });
            keyMap.set(address, pk);
        }

        let raw = '';

        const version = '02000000';
        const locktime = '00000000';

        raw += version; // version
        raw += '00'; // marker
        raw += '01'; // flag

        raw += this.helper.getCompactSize(tx['inputs'].length); // inputcount
        let inData = '';
        let seqs = '';
        const sequence = 'fdffffff'; // sequence, enable RBF
        for (const input of tx['inputs']) {
            const txId = this.helper.hexToLE(input['txid']); // txid, must be Reverse Byte Order
            const vout = this.helper.hexToLE(input['vout'].toString(16).padStart(8, '0')); // vout

            raw += txId + vout;
            raw += '00'; // scriptsig size, segwit should be 0
            raw += sequence;
            
            inData += txId + vout;
            seqs += sequence;
            input['txid-vout'] = txId + vout; // add a new property txid + vout
        }

        raw += this.helper.getCompactSize(tx['outputs'].length); // outputcount
        let outData = '';
        for (const output of tx['outputs']) {
            const scriptPubkey = `0014${this.getHash160Sigwit(output['address'])}`; // scriptpubkey
            const keySize = this.helper.getCompactSize(scriptPubkey.length / 2); // scriptpubkeysize
            const finalAmt = output['change'] ? output['amount'] - fee : output['amount']; // output with change flag will deduct network fee
            let amount = this.helper.hexToLE(finalAmt.toString(16).padStart(16, '0')); // amount

            outData += amount + keySize + scriptPubkey;
            raw += amount + keySize + scriptPubkey;
        }

        // witness part
        for (const input of tx['inputs']) {
            const wifKey = keyMap.get(input['address']);
            const decoded = wif.decode(wifKey);
            const node = bip32.fromPrivateKey(decoded.privateKey, decoded.compressed ? Buffer.alloc(32) : undefined);

            raw += '02'; // stackitems
            const rawSignature = node.sign(this.getPreimage(version, inData, outData, seqs, sequence, locktime, input), true);
            const signature = Buffer.from(this.helper.toDER(rawSignature)).toString('hex') + '01'; // DER Sign + SIGHASH_ALL (0x01)
            raw += this.helper.getCompactSize(signature.length / 2); // signature size
            raw += signature; // signature

            const publicKey = node.publicKey.toString('hex');
            raw += this.helper.getCompactSize(publicKey.length / 2); // publicKey size
            raw += publicKey; // publicKey
        }

        raw += locktime; // locktime

        fs.writeFile(this.signFile, raw, 'utf8');
    }

    private async getAddr(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://mempool.space/api/address/${address}`);
        const balance = resp.data['chain_stats']['funded_txo_sum'] - resp.data['chain_stats']['spent_txo_sum'];
        const unBalance = resp.data['mempool_stats']['funded_txo_sum'] - resp.data['mempool_stats']['spent_txo_sum'];
        const isSpent = resp.data['chain_stats']['spent_txo_count'] > 0;
        const spentFlag = isSpent ? "✘" : "✔";

        return { balance: balance, unBalance: unBalance, spentFlag: spentFlag };
    }

    private async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://mempool.space/api/address/${address}/utxo`);
        const utxos = [];
        resp.data.forEach(utxo => {
            utxos.push({ txid: utxo['txid'], vout: utxo['vout'], value: utxo['value'] });
        });

        return utxos;
    }

    private async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://mempool.space/api/v1/fees/recommended`);
        return resp.data['fastestFee'];
    }  

    private getSigwitAddress(hash160: Buffer): string {
        const witnessVersion = 0;
        const words = [witnessVersion, ...bech32.toWords(hash160)];
        const hrp = 'bc';
        return bech32.encode(hrp, words);
    }
    
    private getHash160Sigwit(address: `bc1${string}`): string {
        const decoded = bech32.decode(address);
        const data = bech32.fromWords(decoded.words.slice(1));
        return Buffer.from(data).toString('hex');
    }

    private getPreimage(version: string, inData: string, outData: string,
         seqs: string, sequence: string, locktime: string, input: any[]): Buffer<ArrayBuffer> {
        let preimage = '';
        // Grab the version field
        preimage += version;
        // Serialize and hash the TXIDs and VOUTs for the inputs
        preimage += this.helper.hash256(inData);
        // Serialize and hash the sequences for the inputs
        preimage += this.helper.hash256(seqs);
        // Serialize the TXID and VOUT for the input we're signing
        preimage += input['txid-vout'];
        // Create a scriptcode for the input we're signing
        const scriptPubkey = this.getHash160Sigwit(input['address']);
        preimage += `1976a914${scriptPubkey}88ac`;
        // Find the input amount
        preimage += this.helper.hexToLE(input['value'].toString(16).padStart(16, '0'));
        // Grab the sequence for the input we're signing
        preimage += sequence;
        // Serialize and hash all the outputs
        preimage += this.helper.hash256(outData);
        // Grab the locktime
        preimage += locktime;
        // Add signature hash type to the end of the hash preimage
        preimage += '01000000'; // SIGHASH_ALL
        // Hash the preimage
        preimage = this.helper.hash256(preimage);

        return Buffer.from(preimage, 'hex');
    }

    private calcVSize(tx : any): number {
        let vSize = 4 + 2 * 0.25; // Version + (Marker + Flag) * 0.25
        const inputTotal = this.helper.getCompactSize(tx['inputs'].length); 
        vSize += tx['inputs'].length * ((inputTotal.length / 2) + 32 + 4 + 1 + 4);
        const outputTotal = this.helper.getCompactSize(tx['outputs'].length); 
        vSize += tx['outputs'].length * ((outputTotal.length / 2) + 8 + 1 + 22);
        vSize += tx['outputs'].length * (1 + 1 + 72 + 1 + 33) * 0.25; // witness
        vSize += 4; // locktime
        return vSize;
    }

    // async sign(): Promise<void> {
    //     const bip32 = BIP32Factory(ecc);
    //     const data = await fs.readFile(this.txFile, 'utf8');
    //     const tx = JSON.parse(data);
    //     const size = this.calcSize(tx);
    //     const fee = Math.ceil(size * tx['fee']); // calculated fee

    //     console.log('----------------------------------');
    //     console.log('calculated fee: ' + fee + ' ' + this.unit);
    //     console.log('size: ' + size + ' bytes');
    //     console.log('----------------------------------');

    //     // loop all input and get all addresses
    //     // remove duplicate addresses
    //     const addresses = new Set<string>();
    //     for (const addr of tx['inputs']) {
    //         addresses.add(addr['address']);
    //     }

    //     // collect pk and associated to address
    //     const keyMap = new Map<string, string>();
    //     for (const address of addresses) {
    //         const pk = await input({ message: `Type WIF private key for address [${address}]: `, required: true });
    //         keyMap.set(address, pk);
    //     }

    //     let raw = '';

    //     const version = '02000000';
    //     const locktime = '00000000';

    //     raw += version; // version

    //     raw += this.helper.getCompactSize(tx['inputs'].length); // inputcount
    //     const sequence = 'fdffffff'; // sequence, enable RBF
    //     for (const input of tx['inputs']) {
    //         const txId = this.helper.hexToLE(input['txid']); // txid, must be Reverse Byte Order
    //         const vout = this.helper.hexToLE(input['vout'].toString(16).padStart(8, '0')); // vout

    //         raw += txId + vout;
    //         raw += `{${input['txid']}}`; // scriptsig size and scriptsig, set placeholder here
    //         raw += sequence;
    //     }

    //     raw += this.helper.getCompactSize(tx['outputs'].length); // outputcount
    //     for (const output of tx['outputs']) {
    //         const scriptPubkey = `76a914${this.getHash160Legacy(output['address'])}88ac`;; // scriptpubkey
    //         const keySize = this.helper.getCompactSize(scriptPubkey.length / 2); // scriptpubkeysize
    //         const finalAmt = output['change'] ? output['amount'] - fee : output['amount']; // output with change flag will deduct network fee
    //         let amount = this.helper.hexToLE(finalAmt.toString(16).padStart(16, '0')); // amount

    //         raw += amount + keySize + scriptPubkey;
    //     }

    //     raw += locktime; // locktime

    //     // calculate and update signature part of tx
    //     const preimage = raw; // clone the current raw string
    //     for (const input of tx['inputs']) {
    //         const wifKey = keyMap.get(input['address']);
    //         const decoded = wif.decode(wifKey);
    //         const node = bip32.fromPrivateKey(decoded.privateKey, decoded.compressed ? Buffer.alloc(32) : undefined);

    //         const rawSignature = node.sign(this.getMessageToBeSigned(preimage, input), true);
    //         const signature = Buffer.from(this.helper.toDER(rawSignature)).toString('hex') + '01'; // DER Sign + SIGHASH_ALL (0x01)
    //         const sigSize = this.helper.getCompactSize(signature.length / 2); // signature size

    //         const publicKey = node.publicKey.toString('hex');
    //         const publicKeySize = this.helper.getCompactSize(publicKey.length / 2); // publicKey size

    //         const scriptSig = sigSize + signature + publicKeySize + publicKey;
    //         const scriptSigSize = this.helper.getCompactSize(scriptSig.length / 2);

    //         raw = raw.replace(`{${input['txid']}}`, scriptSigSize + scriptSig);
    //     }

    //     fs.writeFile(this.signFile, raw, 'utf8');
    // }    

    // private getPreimageLagacy(preimage: string, input: any[]): Buffer<ArrayBuffer> {
    //     const scriptSig = `1976a914${this.getHash160Legacy(input['address'])}88ac`;
    //     const scriptSigSize = this.helper.getCompactSize(scriptSig.length / 2);

    //     // put the ScriptPubKey from the output we want to spend into the ScriptSig of our input
    //     preimage = preimage.replace(`{${input['txid']}}`, scriptSigSize + scriptSig);
    //     // Remove existing ScriptSigs for other inputs
    //     preimage = preimage.replace(/\{[^}]*\}/g, "00"); 
    //     // Add signature hash type to the end of the hash preimage
    //     preimage += '01000000'; // SIGHASH_ALL
    //     // Hash the preimage
    //     preimage = this.helper.hash256(preimage);

    //     return Buffer.from(preimage, 'hex');
    // }  
}