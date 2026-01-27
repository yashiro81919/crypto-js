import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { BitcoinBase } from './bitcoin-base';

export class Bitcoin extends BitcoinBase {
    chain = 'Bitcoin';
    token = 'BTC';
    purpose = '84';
    coin = '0';
    account = '0';
    change = '0';
    color = '214';

    unit = 'sat/vB';

    constructor(helper: Helper) {
        super(helper);
    }

    // Bitcoin is Sigwit address
    getAddress(child: BIP32Interface): string {
        return super.getSigwitAddress(child, 'bc');
    }

    getWIF(child: BIP32Interface): string {
        return child.toWIF();
    }

    async getAddrDetail(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://mempool.space/api/address/${address}`);
        const balance = BigInt(resp.data['chain_stats']['funded_txo_sum']) - BigInt(resp.data['chain_stats']['spent_txo_sum']);
        const unBalance = BigInt(resp.data['mempool_stats']['funded_txo_sum']) - BigInt(resp.data['mempool_stats']['spent_txo_sum']);
        const isSpent = resp.data['chain_stats']['spent_txo_count'] > 0;
        const spentFlag = isSpent ? "✘" : "✔";

        return { balance: balance, unBalance: unBalance, spentFlag: spentFlag };
    }

    async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://mempool.space/api/address/${address}/utxo`);
        const utxos = [];
        resp.data.forEach(utxo => {
            utxos.push({ txid: utxo['txid'], vout: utxo['vout'], value: utxo['value'] });
        });

        return utxos;
    }

    async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://mempool.space/api/v1/fees/recommended`);
        return resp.data['fastestFee'];
    }    

    async sign(tx: any): Promise<void> {
        super.signSigwit(tx);
    }

    isLegacyAddress(address: string): boolean {
        return address.startsWith('1');
    }
}