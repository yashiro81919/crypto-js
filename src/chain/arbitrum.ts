import { input, confirm, select, password } from '@inquirer/prompts';
import { encode as rlpEncode } from 'rlp';
import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Blockchain } from './blockchain';
import * as fs from 'fs/promises';

export class Arbitrum implements Blockchain {
    chain = 'Arbitrum One';
    token = 'ETH';
    purpose = '44';
    coin = '9001';
    account = '0';
    change = '0';
    color = '32';
    helper: Helper;

    private unit = 'gwei/gas';
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

        this.helper.print(this.color, '---------------------Arbitrum One ERC20---------------------');
        addr.tokens.forEach(token => {
            this.helper.updateToken(accountName, index, token.address, token.value / token.unit, token.name);
            this.helper.print(this.color, `|${token.name}|${token.address}|${token.value / token.unit}`);
        });

        this.helper.updateDb(accountName, index, addr.balance / this.wei);
    }

    async showUsingAddresses(xpub: BIP32Interface, accountName: string): Promise<void> {
        let total = 0;
        const using_addrs = this.helper.getUsingAddresses(accountName);

        for (const a of using_addrs) {
            const ck = xpub.derivePath(`${String(this.account)}/${a.idx}`);
            const fullPubKey = this.helper.decompressPublicKey(ck.publicKey);
            const address = this.getEthereumAddress(fullPubKey);

            const addr = await this.getAddr(address);
            this.helper.print(this.color, `|${a.idx}|${address}|${addr.balance / this.wei}|${addr.tokens.map(t => t.name).join(',')}`);
            total += addr.balance;

            this.helper.updateDb(accountName, a.idx, addr.balance / this.wei);
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
        let txUint: number;
        let tokenObj: any = {};
        const addrObj = await this.getAddr(inputAddr);
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
                message: 'Choose ERC20 token: ', choices: addrObj.tokens.map(t => {
                    return { value: t.address, name: t.name };
                })
            });
            tokenObj = addrObj.tokens.find(t => t.address === token);
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
        console.log(`transaction fee: ${feeGw} ${this.unit}`);
        console.log('----------------------------------');
        console.log(`transfer ${type === 0 ? `${this.token}: ` : `ERC20 token [${tokenObj.name}]: `} ${balance}`);
        console.log(`input addr: ${inObj.address}`);
        console.log(`output addr: ${outObj.address}`);
        console.log('----------------------------------');

        const status = await confirm({ message: 'Continue to create transaction: ' });
        if (status) {
            const tx = { coin: this.coin, fee: feeW, nonce: nonce, type: type, token: tokenObj.address, input: inputAddr, output: outputAddr, balance: this.helper.convertBigInt(inBalance), amount: this.helper.convertBigInt(outBalance) };
            fs.writeFile(this.helper.TX_FILE, JSON.stringify(tx), 'utf8');
        }
    }

    async sign(tx: any): Promise<void> {
        const gas = this.calcGas(tx);
        const feeW = gas * tx['fee'];

        console.log('----------------------------------');
        console.log(`calculated network fee: ${feeW / this.wei} ${this.token}`);
        console.log(`gas: ${gas}`);
        console.log('----------------------------------');

        const pk = await password({ message: `Type private key for address [${tx.input}]: `, mask: '*' });

        let to: string;
        let value: number;
        let txData: Uint8Array;
        if (tx['type'] === 0) {
            to = this.helper.strip0x(tx['output']);
            const surplus = tx['amount'] + feeW - tx['balance'];
            value = surplus > 0 ? tx['amount'] - surplus : tx['amount'];
            txData = new Uint8Array([]);
        } else {
            to = this.helper.strip0x(tx['token']);
            value = 0;
            txData = Buffer.from(this.helper.strip0x(this.encodeERC20Transfer(tx['output'], BigInt(tx['amount']))), 'hex');
        }

        const unsignedTx = [
            42161n, // chainId
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
        const resp = await this.helper.api.get(`https://arbitrum.blockscout.com/api/v2/addresses/${address}`);
        const balance = resp.data['coin_balance'] ? resp.data['coin_balance'] : '0';
        const tokens = [];

        if (resp.data['has_tokens']) {
            const respToken = await this.helper.api.get(`https://arbitrum.blockscout.com/api/v2/addresses/${address}/tokens?type=ERC-20`);
            const validTokens = respToken.data['items'].filter(t => t['token']['exchange_rate']);
            for (const token of validTokens) {
                const tokenMeta = token['token'];
                tokens.push({
                    name: tokenMeta['symbol'], address: tokenMeta['address_hash'].toLowerCase(), value: Number(token['value']), unit: 10 ** Number(tokenMeta['decimals'])
                });
            }            
        }
        return { balance: Number(balance), tokens: tokens };
    }

    private async getNonce(address: string): Promise<number> {
        const resp = await this.helper.api.post(`https://arb1.arbitrum.io/rpc`, {jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [address,'latest'], id: '1'});
        const nonce = resp.data['result'] ? resp.data['result'] : '0';
        return Number(nonce);
    }

    private async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://arbitrum.blockscout.com/api/v2/stats`);
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