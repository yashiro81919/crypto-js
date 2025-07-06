import { input, confirm, select } from '@inquirer/prompts';
import { encode as rlpEncode } from 'rlp'
import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { keccak_256 } from '@noble/hashes/sha3';
import { Coin } from './coin';
import * as fs from 'fs/promises';

export class Ethereum implements Coin {
    code = 'ETH';
    purpose = '44';
    coin = '60';
    account = '0';
    change = '0';
    helper: Helper;

    private unit = 'gwei/gas';
    private txFile = 'tx_eth';
    private signFile = 'signed_tx_eth';
    private color = '\x1b[38;5;92m';
    private wei = Number(1000000000000000000n);
    private gWei = 1000000000;
    private erc20Unit = 1000000;
    private erc20Tokens = [
        { name: 'USDT', address: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
        { name: 'USDC', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
        { name: 'DAI', address: '0x6b175474e89094c44da98b954eedeac495271d0f' }
    ];
    private apiKey: string;

    constructor(helper: Helper) {
        this.helper = helper;
    }

    initAPIKey(): void {
        this.apiKey = this.helper.getAPIKey('etherscan');
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

        const tokens = await this.getTokens(address);
        this.helper.print(this.color, '---------------------ERC20---------------------');
        tokens.forEach(token => this.helper.print(this.color, `|${token.name}|${token.value / this.erc20Unit}`));

        this.helper.updateDb(accountName, index, addr.balance + addr.unBalance);
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

            this.helper.updateDb(accountName, a.idx, addr.balance + addr.unBalance);
        }

        console.log(`Total Balance: ${total / this.wei}`);
    }

    async createTx(): Promise<void> {
        // calculate network fees
        let feeW = await this.getFee();
        let feeGw = feeW / this.gWei;

        const newFee = await input({ message: `Type new fee if you want to change (${this.unit}): `, default: feeGw.toString(), validate: this.helper.isFloat });
        feeGw = Number(newFee);
        feeW = (feeGw * this.wei) / this.gWei;

        // choose transfer type
        const type = await select({
            message: 'Choose your action: ', choices: [
                { value: 0, name: 'transfer Ethereum' },
                { value: 1, name: 'transfer ERC20 token' }
            ]
        });

        let token: string;
        if (type === 1) {
            token = await select({
                message: 'Choose ERC20 token: ', choices: this.erc20Tokens.map(t => {
                    return { value: t.name, name: t.name };
                })
            });
        }

        // add input address
        const inputAddr = await input({ message: 'Type input address: ', required: true });
        let inBalance: number;
        let nonce: number;
        let txUint: number;
        const addrObj = await this.getAddr(inputAddr);
        nonce = addrObj.nonce;
        if (type === 0) {
            inBalance = addrObj.balance;
            txUint = this.wei;
        } else {
            const tokens = await this.getTokens(inputAddr);
            inBalance = tokens.find(t => t.name === token).value;
            txUint = this.erc20Unit;
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
        console.log(`transfer ${type === 0 ? 'Ethereum: ' : `ERC20 token ${token}: `} ${balance}`);
        console.log(`input addr: ${inObj.address}`);
        console.log(`output addr: ${outObj.address}`);
        console.log('----------------------------------');

        const status = await confirm({ message: 'Continue to create transaction: ' });
        if (status) {
            const tx = { fee: feeW, nonce: nonce, type: type, token: token, input: inputAddr, output: outputAddr, balance: inBalance, amount: outBalance };
            fs.writeFile(this.txFile, JSON.stringify(tx), 'utf8');
        }
    }

    async sign(): Promise<void> {
        const data = await fs.readFile(this.txFile, 'utf8');
        const tx = JSON.parse(data);
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
        if (tx['type'] === 0) {
            to = this.helper.strip0x(tx['output']);
            const surplus = tx['amount'] + feeW - tx['balance'];
            value = surplus > 0 ? tx['amount'] - surplus : tx['amount'];
            txData = new Uint8Array([]);
        } else {
            to = this.helper.strip0x(this.erc20Tokens.find(t => t.name === tx['token']).address);
            value = 0;
            txData = hexToBytes(this.helper.strip0x(this.encodeERC20Transfer(tx['output'], tx['amount'])));
        }

        const unsignedTx = [
            1n, // chainId
            tx['nonce'],  // nonce
            tx['fee'] , // maxPriorityFeePerGas
            tx['fee'] , // maxFeePerGas
            gas,  // gasLimit
            hexToBytes(to), // to address
            value,  // value
            txData,  // data
            [] // accessList (empty list)
        ];

        const rlpEncoded = rlpEncode(unsignedTx);
        const message = new Uint8Array([0x02, ...rlpEncoded]);
        const messageHash = keccak_256(message);
        const privateKey = this.helper.strip0x(pk);

        const secp = await import('@noble/secp256k1');
        const rawSignature = await secp.signAsync(messageHash, privateKey, { lowS: true }); // sig is 64 bytes, recoveryId is v

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
        const raw = `0x02${bytesToHex(signedRlp)}`; // EIP-1559 tx prefix is 0x02

        fs.writeFile(this.signFile, raw, 'utf8');
        console.log(raw);
    }

    private async getAddr(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://api.blockcypher.com/v1/eth/main/addrs/${address}/full`);
        const balance = resp.data['balance'];
        const unBalance = resp.data['unconfirmed_balance'];
        const nonce = resp.data['nonce'];
        return { balance: balance, unBalance: unBalance, nonce: nonce ? nonce : 0 };
    }

    private async getTokens(address: string): Promise<any[]> {
        const tokens = [];
        for (const token of this.erc20Tokens) {
            const resp = await this.helper.api.get(`https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokenbalance&contractaddress=${token.address}&address=${address}&tag=latest&apikey=${this.apiKey}`);
            tokens.push({ name: token.name, value: resp.data['result'] });
        }
        return tokens;
    }

    private async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://api.blockcypher.com/v1/eth/main`);
        return resp.data['high_priority_fee'];
    }

    private getEthereumAddress(publicKey: Uint8Array): string {
        // Assume `publicKey` is a Uint8Array of 64 bytes (no 0x04 prefix)
        publicKey = publicKey.slice(1);
        const hash = keccak_256(publicKey); // returns Uint8Array
        return '0x' + bytesToHex(hash.slice(-20));
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