import { input, confirm, password } from '@inquirer/prompts';
import { bech32 } from '@scure/base';
import { BIP32Interface } from "bip32";
import { Blockchain } from "./blockchain";
import { Helper } from "../helper";
import { secp256k1 } from '@noble/curves/secp256k1';
import * as fs from 'fs/promises';

export abstract class BitcoinBase implements Blockchain {
    abstract chain: string;
    abstract token: string;
    abstract purpose: string;
    abstract coin: string;
    abstract account: string;
    abstract change: string;
    abstract color: string;
    helper: Helper;

    abstract unit: string;
    private satoshi = 10n ** 8n;

    constructor(helper: Helper) {
        this.helper = helper;
    }
    
    abstract getAddress(child: BIP32Interface): string;
    abstract getWIF(child: BIP32Interface): string;
    abstract getAddrDetail(address: string): Promise<any>;
    abstract getUtxos(address: string): Promise<any[]>;
    abstract getFee(): Promise<number>;
    abstract sign(tx: any): void;    
    abstract isLegacyAddress(address: string): boolean;
    
    showKeyInfo(root: BIP32Interface, index: string): void {
        const child = root.derivePath(`m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}`);

        let detail = `-----------m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}-------------------\n`;

        detail += `Private Key: ${child.privateKey.toString('hex')}\n`;
        detail += `Public Key: ${child.publicKey.toString('hex')}\n`;
        detail += `Address: ${this.getAddress(child)}\n`;
        detail += `WIF: ${this.getWIF(child)}\n`;
        detail += '------------------------------------------------\n';

        this.helper.print(this.color, detail);
    };

    async showAddressDetail(xpub: BIP32Interface, accountName: string, index: string): Promise<void> {
        const ck = xpub.derivePath(`${String(this.account)}/${index}`);
        const address = this.getAddress(ck);

        const addr = await this.getAddrDetail(address);
        this.helper.print(this.color, `|${index}|${address}|${this.helper.bigIntDivide(addr.balance, this.satoshi)}|${addr.spentFlag}`);

        const utxos = await this.getUtxos(address);
        this.helper.print(this.color, '---------------------UTXO---------------------');
        utxos.forEach(utxo => this.helper.print(this.color, `|${utxo.vout}|${utxo.txid}|${utxo.value}`));

        this.helper.updateDb(accountName, index, this.helper.bigIntDivide(addr.balance + addr.unBalance, this.satoshi));
    }

    async showUsingAddresses(xpub: BIP32Interface, accountName: string): Promise<void> {
        let total = 0n;
        const usingAddrs = this.helper.getUsingAddresses(accountName);

        for (const a of usingAddrs) {
            await this.helper.sleep(500);
            const ck = xpub.derivePath(`${String(this.account)}/${a.idx}`);
            const address = this.getAddress(ck);

            const addr = await this.getAddrDetail(address);
            this.helper.print(this.color, `|${a.idx}|${address}|${this.helper.bigIntDivide(addr.balance, this.satoshi)}|${addr.spentFlag}`);
            total += addr.balance;

            this.helper.updateDb(accountName, a.idx, this.helper.bigIntDivide(addr.balance + addr.unBalance, this.satoshi));
        }

        console.log(`Total Balance: ${this.helper.bigIntDivide(total, this.satoshi)}`);
    }

    async createTx(): Promise<void> {
        let totalInput = 0n;
        let totalOutput = 0n;
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
            const addrObj = await this.getAddrDetail(addr);
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
            const remainAmt = this.helper.bigIntDivide(totalInput - totalOutput, this.satoshi);
            const addr = await input({ message: 'Type output address: ', required: true });
            const balance = await input({ message: 'Type amount: ', required: true, default: remainAmt, validate: (value) => { return this.helper.validateAmount(value, remainAmt); } });

            const realBal = this.helper.bigIntMultiply(balance, this.satoshi);
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

        inputAddrs.forEach(addr => console.log(`input addr: ${addr.address}|${this.helper.bigIntDivide(addr.balance, this.satoshi)}`));
        outputAddrs.forEach(addr => console.log(`output addr: ${addr.address}|${this.helper.bigIntDivide(addr.balance, this.satoshi)}`));
        if (changeAddr) {
            console.log(`change addr: ${changeAddr.address}|${this.helper.bigIntDivide(changeAddr.balance, this.satoshi)}`);
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
                return { address: addr.address, amount: addr.balance.toString(), change: false };
            });
            tx.outputs.push(...outputs);

            // create output from changeAddr if have
            if (changeAddr) {
                tx.outputs.push({ address: changeAddr.address, amount: changeAddr.balance.toString(), change: true });
            } else {
                tx.outputs[tx.outputs.length - 1].change = true;
            }

            fs.writeFile(this.helper.TX_FILE, JSON.stringify(tx), 'utf8');
        }
    }

    async signLegacy(tx: any): Promise<void> {
        const size = this.calcLegacySize(tx);
        const fee = Math.ceil(size * tx['fee']); // calculated fee

        console.log('----------------------------------');
        console.log(`calculated fee: ${this.helper.bigIntDivide(BigInt(fee), this.satoshi)} ${this.token}`);
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
    
    async signSigwit(tx: any): Promise<void> {
        const vSize = this.calcSigwitVSize(tx);
        const fee = Math.ceil(vSize * tx['fee']); // calculated fee

        console.log('----------------------------------');
        console.log(`calculated fee: ${this.helper.bigIntDivide(BigInt(fee), this.satoshi)} ${this.token}`);
        console.log(`vSize: ${vSize} vbytes`);
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
            const scriptPubkey = this.getOutputScriptPubkey(output['address']); // scriptpubkey
            const keySize = this.helper.getCompactSize(scriptPubkey.length / 2); // scriptpubkeysize
            const finalAmt = output['change'] ? BigInt(output['amount']) - BigInt(fee) : BigInt(output['amount']); // output with change flag will deduct network fee
            let amount = this.helper.hexToLE(finalAmt.toString(16).padStart(16, '0')); // amount

            outData += amount + keySize + scriptPubkey;
            raw += amount + keySize + scriptPubkey;
        }

        // witness part
        for (const input of tx['inputs']) {
            const privateKey = keyMap.get(input['address']);

            raw += '02'; // stackitems
            const rawSignature = secp256k1.sign(this.getPreimage(version, inData, outData, seqs, sequence, locktime, input), privateKey, { lowS: true });
            const signature = `${rawSignature.toDERHex()}01`; // DER Sign + SIGHASH_ALL (0x01)
            raw += this.helper.getCompactSize(signature.length / 2); // signature size
            raw += signature; // signature

            // const publicKey = node.publicKey.toString('hex');
            const publicKey = Buffer.from(secp256k1.getPublicKey(privateKey)).toString('hex');
            raw += this.helper.getCompactSize(publicKey.length / 2); // publicKey size
            raw += publicKey; // publicKey
        }

        raw += locktime; // locktime

        fs.writeFile(this.helper.SIG_TX_FILE, raw, 'utf8');
        console.log(raw);
    }

    async signCash(tx: any): Promise<void> {
        const size = this.calcLegacySize(tx);
        const fee = Math.ceil(size * tx['fee']); // calculated fee

        console.log('----------------------------------');
        console.log(`calculated fee: ${this.helper.bigIntDivide(BigInt(fee), this.satoshi)} ${this.token}`);
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

        const version = '02000000';
        const locktime = '00000000';

        raw += version; // version

        raw += this.helper.getCompactSize(tx['inputs'].length); // inputcount
        let inData = '';
        let seqs = '';
        const sequence = 'fdffffff'; // sequence, enable RBF
        for (const input of tx['inputs']) {
            const txId = this.helper.hexToLE(input['txid']); // txid, must be Reverse Byte Order
            const vout = this.helper.hexToLE(input['vout'].toString(16).padStart(8, '0')); // vout

            raw += txId + vout;
            raw += `{${input['txid']}}`; // scriptsig size and scriptsig, set placeholder here
            raw += sequence;

            inData += txId + vout;
            seqs += sequence;
            input['txid-vout'] = txId + vout; // add a new property txid + vout            
        }

        raw += this.helper.getCompactSize(tx['outputs'].length); // outputcount
        let outData = '';
        for (const output of tx['outputs']) {
            const scriptPubkey = `76a914${this.getHash160Legacy(output['address'])}88ac`;; // scriptpubkey
            const keySize = this.helper.getCompactSize(scriptPubkey.length / 2); // scriptpubkeysize
            const finalAmt = output['change'] ? output['amount'] - fee : output['amount']; // output with change flag will deduct network fee
            let amount = this.helper.hexToLE(finalAmt.toString(16).padStart(16, '0')); // amount

            outData += amount + keySize + scriptPubkey;
            raw += amount + keySize + scriptPubkey;
        }

        raw += locktime; // locktime

        // calculate and update signature part of tx
        for (const input of tx['inputs']) {
            const privateKey = keyMap.get(input['address']);

            const rawSignature = secp256k1.sign(this.getPreimageCash(version, inData, outData, seqs, sequence, locktime, input), privateKey, { lowS: true });
            const signature = `${rawSignature.toDERHex()}41`; // DER Sign + SIGHASH_FORKID (0x41)
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

    getLegacyAddress(child: BIP32Interface, prefix: string): string {
        const hash160Hex = child.identifier.toString('hex');
        let address = this.helper.bs58Enc(prefix + hash160Hex);
        // Bitcoin family need add 1
        if (prefix === '00') {
            address = '1' + address;
        }
        return address;
    }    

    getSigwitAddress(child: BIP32Interface, hrp: string): string {
        const witnessVersion = 0;
        const words = [witnessVersion, ...bech32.toWords(child.identifier)];
        return bech32.encode(hrp, words);
    }

    getCommonWIF(child: BIP32Interface, prefix: string): string {
        if (child.privateKey.length !== 32) {
            throw new Error('Private key must be 32 bytes (64 hex characters)');
        }
        const privKeyHex = `${child.privateKey.toString('hex')}01`;
        return this.helper.bs58Enc(prefix + privKeyHex);
    }
    
    private calcLegacySize(tx: any): number {
        let size = 4; // Version
        const inputTotal = this.helper.getCompactSize(tx['inputs'].length);
        size += tx['inputs'].length * ((inputTotal.length / 2) + 32 + 4 + 1 + (1 + 72 + 1 + 33) + 4);
        const outputTotal = this.helper.getCompactSize(tx['outputs'].length);
        size += tx['outputs'].length * ((outputTotal.length / 2) + 8 + 1 + 25);
        size += 4; // locktime
        return size;
    }
    
    private calcSigwitVSize(tx: any): number {
        let vSize = 4 + 2 * 0.25; // Version + (Marker + Flag) * 0.25
        const inputTotal = this.helper.getCompactSize(tx['inputs'].length);
        vSize += tx['inputs'].length * ((inputTotal.length / 2) + 32 + 4 + 1 + 4);
        const outputTotal = this.helper.getCompactSize(tx['outputs'].length);
        vSize += tx['outputs'].length * ((outputTotal.length / 2) + 8 + 1 + 22);
        vSize += tx['outputs'].length * (1 + 1 + 72 + 1 + 33) * 0.25; // witness
        vSize += 4; // locktime
        return vSize;
    }
    
    private getOutputScriptPubkey(address: `${string}1${string}` | string): string {
        if (this.isLegacyAddress(address)) {
            return `76a914${this.getHash160Legacy(address)}88ac`; // legacy
        }
        return `0014${this.getHash160Sigwit(address as `${string}1${string}`)}`; // segwit
    }
    
    private getHash160Sigwit(address: `${string}1${string}`): string {
        const decoded = bech32.decode(address);
        const data = bech32.fromWords(decoded.words.slice(1));
        return Buffer.from(data).toString('hex');
    }

    private getHash160Legacy(address: string): string {
        let hash160 = this.helper.bs58Dec(address);
        if (!address.startsWith('1')) { // only Bitcoin series don't need to remove the first 2 chars
            hash160 = hash160.slice(2);
        }
        return hash160;
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

    private getPreimageCash(version: string, inData: string, outData: string,
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
        const scriptPubkey = this.getHash160Legacy(input['address']);
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
        preimage += '41000000'; // SIGHASH_FORKID
        // Hash the preimage
        preimage = this.helper.hash256(preimage);

        return Buffer.from(preimage, 'hex');
    }    
}