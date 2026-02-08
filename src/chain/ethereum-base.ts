import { input, confirm, select, password } from '@inquirer/prompts';
import { encode as rlpEncode } from 'rlp';
import { Helper } from "../helper";
import { BIP32Interface } from "bip32";
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Blockchain } from "./blockchain";
import * as fs from 'fs/promises';

export abstract class EthereumBase implements Blockchain {
    abstract chain: string;
    abstract token: string;
    abstract purpose: string;
    abstract coin: string;
    abstract account: string;
    abstract change: string;
    abstract color: string;
    helper: Helper;

    private unit = 'gwei/gas';
    private wei = 10n ** 18n;
    private gWei = 10 ** 9;

    constructor(helper: Helper) {
        this.helper = helper;
    }

    abstract supportedTokens: any[];
    abstract getAddrDetail(address: string): Promise<any>;
    abstract getNonce(address: string): Promise<number>;
    abstract getFee(): Promise<number>;
    abstract sign(tx: any): void;    

    showKeyInfo(root: BIP32Interface, index: string): void {
        const child = root.derivePath(`m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}`);

        let detail = `-----------m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}-------------------\n`;

        detail += `Private Key: 0x${child.privateKey?.toString('hex')}\n`;
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

        const addr = await this.getAddrDetail(address);
        this.helper.print(this.color, `|${index}|${address}|${this.helper.bigIntDivide(addr.balance, this.wei)}`);

        this.helper.print(this.color, `---------------------${this.chain} ERC20---------------------`);
        addr.tokens.forEach((token: { address: string; value: bigint; unit: bigint; name: string; }) => {
            this.helper.updateToken(accountName, index, token.address, this.helper.bigIntDivide(token.value, token.unit), token.name);
            this.helper.print(this.color, `|${token.name}|${token.address}|${this.helper.bigIntDivide(token.value, token.unit)}`);
        });

        this.helper.updateDb(accountName, index, this.helper.bigIntDivide(addr.balance, this.wei));
    }

    async showUsingAddresses(xpub: BIP32Interface, accountName: string): Promise<void> {
        let total = 0n;
        const usingAddrs = this.helper.getUsingAddresses(accountName);

        for (const a of usingAddrs) {
            await this.helper.sleep(500);
            const ck = xpub.derivePath(`${String(this.account)}/${a.idx}`);
            const fullPubKey = this.helper.decompressPublicKey(ck.publicKey);
            const address = this.getEthereumAddress(fullPubKey);

            const addr = await this.getAddrDetail(address);
            this.helper.print(this.color, `|${a.idx}|${address}|${this.helper.bigIntDivide(addr.balance, this.wei)}|${addr.tokens.map((t: { name: any; }) => t.name).join(',')}`);
            total += addr.balance;

            this.helper.updateDb(accountName, a.idx, this.helper.bigIntDivide(addr.balance, this.wei));
        }

        console.log(`Total Balance: ${this.helper.bigIntDivide(total, this.wei)}`);
    }

    async createTx(): Promise<void> {
        // calculate network fees
        let feeGw = await this.getFee();
        let feeW = feeGw * this.gWei;

        const newFee = await input({ message: `Type new fee if you want to change (${this.unit}): `, default: feeGw.toString(), validate: this.helper.isFloat });
        feeGw = Number(newFee);
        feeW = feeGw * this.gWei;

        // add input address
        const inputAddr = await input({ message: 'Type input address: ', required: true });
        let inBalance: bigint;
        let txUint: bigint;
        let tokenObj: any = {};
        const addrObj = await this.getAddrDetail(inputAddr);
        const nonce = await this.getNonce(inputAddr);

        // choose transfer type
        const type = await select({
            message: 'Choose your action: ', choices: [
                { value: 0, name: `transfer ${this.token}` },
                { value: 1, name: 'transfer ERC20 token' }
            ]
        });

        if (type === 0) {
            inBalance = addrObj.balance;
            txUint = this.wei;
        } else {
            const token = await select({
                message: 'Choose ERC20 token: ', choices: addrObj.tokens.map((t: { address: string; name: string; }) => {
                    return { value: t.address, name: t.name };
                })
            });
            tokenObj = addrObj.tokens.find((t: { address: string; }) => t.address === token);
            inBalance = tokenObj.value;
            txUint = tokenObj.unit;
        }
        const inObj = { address: inputAddr, balance: inBalance };

        const displayAmt = this.helper.bigIntDivide(inBalance, txUint);

        // add output address and amount
        const outputAddr = await input({ message: 'Type output address: ', required: true });

        const balance = await input({ message: 'Type amount: ', required: true, default: displayAmt, validate: (value) => { return this.helper.validateAmount(value, displayAmt); } });

        const outBalance = this.helper.bigIntMultiply(balance, txUint);
        const outObj = { address: outputAddr, balance: outBalance };

        console.log('----------------------------------');
        console.log(`transaction fee: ${feeGw} ${this.unit}`);
        console.log('----------------------------------');
        console.log(`transfer ${type === 0 ? `${this.token}: ` : `ERC20 token [${tokenObj.name}]: `} ${balance}`);
        console.log(`input addr: ${inObj.address}`);
        console.log(`output addr: ${outObj.address}`);
        console.log('----------------------------------');

        const status = await confirm({ message: 'Continue to create transaction: ' });
        if (status) {
            const tx = { coin: this.coin, fee: feeW, nonce: nonce, type: type, token: tokenObj.address, input: inputAddr, output: outputAddr, balance: inBalance.toString(), amount: outBalance.toString() };
            fs.writeFile(this.helper.TX_FILE, JSON.stringify(tx), 'utf8');
        }
    }

    async sign155(tx: any, chainId: bigint): Promise<void> {
        const gas = this.calcGas(tx);
        const feeW = BigInt(gas) * BigInt(tx['fee']);

        console.log('----------------------------------');
        console.log(`calculated network fee: ${this.helper.bigIntDivide(BigInt(feeW), this.wei)} ${this.token}`);
        console.log(`gas: ${gas}`);
        console.log('----------------------------------');

        const pk = await password({ message: `Type private key for address [${tx.input}]: `, mask: '*' });

        let to: string;
        let value: bigint;
        let txData: Uint8Array;
        if (tx['type'] === 0) {
            to = this.helper.strip0x(tx['output']);
            const surplus = BigInt(tx['amount']) + feeW - BigInt(tx['balance']);
            value = surplus > 0n ? BigInt(tx['amount']) - surplus : BigInt(tx['amount']);
            txData = new Uint8Array([]);
        } else {
            to = this.helper.strip0x(tx['token']);
            value = 0n;
            txData = Buffer.from(this.helper.strip0x(this.encodeERC20Transfer(tx['output'], BigInt(tx['amount']))), 'hex');
        }

        const commonTx = [
            BigInt(tx['nonce']),  // nonce
            BigInt(tx['fee']), // gasPrice
            BigInt(gas),  // gasLimit
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
    
    async sign1559(tx: any, chainId: bigint): Promise<void> {
        const gas = this.calcGas(tx);
        const feeW = BigInt(gas) * BigInt(tx['fee']);

        console.log('----------------------------------');
        console.log(`calculated network fee: ${this.helper.bigIntDivide(BigInt(feeW), this.wei)} ${this.token}`);
        console.log(`gas: ${gas}`);
        console.log('----------------------------------');

        const pk = await password({ message: `Type private key for address [${tx.input}]: `, mask: '*' });

        let to: string;
        let value: bigint;
        let txData: Uint8Array;
        if (tx['type'] === 0) {
            to = this.helper.strip0x(tx['output']);
            const surplus = BigInt(tx['amount']) + feeW - BigInt(tx['balance']);
            value = surplus > 0n ? BigInt(tx['amount']) - surplus : BigInt(tx['amount']);
            txData = new Uint8Array([]);
        } else {
            to = this.helper.strip0x(tx['token']);
            value = 0n;
            txData = Buffer.from(this.helper.strip0x(this.encodeERC20Transfer(tx['output'], BigInt(tx['amount']))), 'hex');
        }

        const unsignedTx = [
            chainId, // chainId
            BigInt(tx['nonce']),  // nonce
            BigInt(tx['fee']), // maxPriorityFeePerGas
            BigInt(tx['fee']), // maxFeePerGas
            BigInt(gas),  // gasLimit
            Buffer.from(to, 'hex'), // to address
            value,  // value
            txData,  // data
            [] // accessList (empty list)
        ];

        const rlpEncoded = rlpEncode(unsignedTx);
        const message = new Uint8Array([0x02, ...rlpEncoded]);
        const messageHash = keccak_256(message);
        const privateKey = this.helper.strip0x(pk);

        const rawSignature = secp256k1.sign(messageHash, privateKey, { lowS: true }); // sig is 64 bytes, recoveryId is v

        const r = rawSignature.r;
        const s = rawSignature.s;
        const v = rawSignature.recovery; // 0 or 1

        const signedTx = [
            ...unsignedTx,
            v, // v (recovery id: 0 or 1)
            r, // r
            s // s
        ];

        const signedRlp = rlpEncode(signedTx);
        const raw = `0x02${Buffer.from(signedRlp).toString('hex')}`; // EIP-1559 tx prefix is 0x02

        fs.writeFile(this.helper.SIG_TX_FILE, raw, 'utf8');
        console.log(raw);
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
            size = 21000;
        } else {
            // ERC20 transfer
            size = 100000;
        }
        return size;
    }
    
    private encodeERC20Transfer(to: string, amount: bigint): string {
        const methodId = 'a9059cbb'; // (first 4 bytes of keccak256("transfer(address,uint256)"))
        const toClean = this.helper.strip0x(to).toLowerCase();
        const paddedTo = toClean.padStart(64, '0');
        const paddedAmount = amount.toString(16).padStart(64, '0');
        return '0x' + methodId + paddedTo + paddedAmount;
    }    
}