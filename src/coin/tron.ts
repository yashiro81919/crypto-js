import { input, confirm, select } from '@inquirer/prompts';
import { encode as rlpEncode } from 'rlp';
import { Helper } from '../helper';
import { base58 } from '@scure/base';
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
        // calculate network fees
        // let feeW = await this.getFee();
        // let feeGw = feeW / this.suns;

        // const newFee = await input({ message: `Type new fee if you want to change (${this.unit}): `, default: feeGw.toString(), validate: this.helper.isFloat });
        // feeGw = Number(newFee);
        // feeW = feeGw / this.suns;

        // choose transfer type
        const type = await select({
            message: 'Choose your action: ', choices: [
                { value: 0, name: 'transfer TRX' },
                { value: 1, name: 'transfer TRC20 token' }
            ]
        });

        let token: string;
        if (type === 1) {
            token = await select({
                message: 'Choose TRC20 token: ', choices: this.trc20Tokens.map(t => {
                    return { value: t.name, name: t.name };
                })
            });
        }

        // add input address
        const inputAddr = await input({ message: 'Type input address: ', required: true });
        let inBalance: number;
        let txUint: number;
        const addrObj = await this.getAddr(inputAddr);
        if (type === 0) {
            inBalance = addrObj.balance;
            txUint = this.suns;
        } else {
            const tokens = addrObj.trc20;
            const tokenObj = tokens.find(t => t.name === token);
            inBalance = tokenObj.value;
            txUint = tokenObj.unit;
        }
        const inObj = { address: inputAddr, balance: inBalance };

        const displayAmt = inBalance / txUint;

        // add output address and amount
        const outputAddr = await input({ message: 'Type output address: ', required: true });

        const balance = await input({ message: 'Type amount: ', required: true, default: displayAmt.toString(), validate: (value) => { return this.helper.validateAmount(value, inBalance); } });

        const outBalance = Number(balance) * txUint;
        const outObj = { address: outputAddr, balance: outBalance };

        console.log('----------------------------------');
        console.log(`transaction fee: ${100} ${this.unit}`);
        console.log('----------------------------------');
        console.log(`transfer ${type === 0 ? 'TRX: ' : `TRC20 token ${token}: `} ${balance}`);
        console.log(`input addr: ${inObj.address}`);
        console.log(`output addr: ${outObj.address}`);
        console.log('----------------------------------');

        const status = await confirm({ message: 'Continue to create transaction: ' });
        if (status) {
            const tx = await this.helper.api.post(`https://api.shasta.trongrid.io/wallet/createtransaction`, {
                owner_address: inObj.address,
                to_address: outObj.address,
                amount: outObj.balance,
                visible: true
            });
            fs.writeFile(this.helper.TX_FILE, JSON.stringify(tx.data), 'utf8');
        }
    }

    async sign(tx: any): Promise<void> {
        const gas = this.calcGas(tx);
        const feeW = gas * tx['fee'];

        console.log('----------------------------------');
        console.log(`calculated network fee: ${feeW / this.suns} ${this.code}`);
        console.log(`gas: ${gas}`);
        console.log('----------------------------------');

        const pk = await input({ message: `Type private key for address [${tx.input}]: `, required: true });

        let to: string;
        let value: number;
        let txData: Uint8Array;
        if (tx['type'] === 0) {
            to = this.helper.strip0x(tx['output']);
            const surplus = tx['amount'] + feeW - tx['balance'];
            value = surplus > 0 ? tx['amount'] - surplus : tx['amount'];
            txData = new Uint8Array([]);
        } else {
            to = this.helper.strip0x(this.trc20Tokens.find(t => t.name === tx['token']).address);
            value = 0;
            txData = Buffer.from(this.helper.strip0x(this.encodeERC20Transfer(tx['output'], tx['amount'])), 'hex');
        }

        const unsignedTx = [
            1n, // chainId
            tx['nonce'],  // nonce
            tx['fee'], // maxPriorityFeePerGas
            tx['fee'], // maxFeePerGas
            gas,  // gasLimit
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

    private async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://api.blockcypher.com/v1/eth/main`);
        return resp.data['high_priority_fee'];
    }

    private getTronAddress(publicKey: Uint8Array): string {
        // Assume `publicKey` is a Uint8Array of 64 bytes (no 0x04 prefix)
        publicKey = publicKey.slice(1);
        const hash = keccak_256(publicKey); // returns Uint8Array
        const address = `41${Buffer.from(hash.slice(-20)).toString('hex')}`;
        // double sha256
        const hash256 = this.helper.hash256(address);
        // first 4 bytes is the checksum
        const checksum = hash256.substring(0, 8);
        // Prepend TRON address prefix: 0x41
        return base58.encode(Buffer.from(`${address}${checksum}`, 'hex'));
    }

    private calcGas(tx: any): number {
        let size: number;
        if (tx.type === 0) {
            // Ethereum transfer
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