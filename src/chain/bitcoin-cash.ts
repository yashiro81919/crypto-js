import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { BitcoinBase } from './bitcoin-base';

export class BitcoinCash extends BitcoinBase {
    chain = 'Bitcoin Cash';
    token = 'BCH';
    purpose = '44';
    coin = '145';
    account = '0';
    change = '0';
    color = '154';

    unit = 'sat/byte';

    constructor(helper: Helper) {
        super(helper);
    }

    // Bitcoin Cash is Legacy address
    getAddress(child: BIP32Interface): string {
        return super.getLegacyAddress(child, '00');
    }

    getWIF(child: BIP32Interface): string {
        return child.toWIF();
    }

    async getAddrDetail(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://bchexplorer.cash/api/address/${address}`);
        const balance = BigInt(resp.data['chain_stats']['funded_txo_sum']) - BigInt(resp.data['chain_stats']['spent_txo_sum']);
        const unBalance = BigInt(resp.data['mempool_stats']['funded_txo_sum']) - BigInt(resp.data['mempool_stats']['spent_txo_sum']);
        const isSpent = resp.data['chain_stats']['spent_txo_count'] > 0;
        const spentFlag = isSpent ? "✘" : "✔";

        return { balance: balance, unBalance: unBalance, spentFlag: spentFlag };
    }

    async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://bchexplorer.cash/api/address/${address}/utxo`);
        const utxos : any[] = [];
        resp.data.forEach((utxo: any) => {
            utxos.push({ txid: utxo['txid'], vout: utxo['vout'], value: utxo['value'] });
        });

        return utxos;
    }

    async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://bchexplorer.cash/api/v1/fees/recommended`);
        return resp.data['fastestFee'];
    }

    async sign(tx: any): Promise<void> {
        super.signCash(tx);
    }

    isLegacyAddress(address: string): boolean {
        return address.startsWith('1');
    }
}