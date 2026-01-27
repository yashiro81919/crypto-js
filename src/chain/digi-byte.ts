import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { BitcoinBase } from './bitcoin-base';

export class DigiByte extends BitcoinBase {
    chain = 'DigiByte';
    token = 'DGB';
    purpose = '44';
    coin = '20';
    account = '0';
    change = '0';
    color = '21';

    unit = 'digibit/byte';

    constructor(helper: Helper) {
        super(helper);
    }

    getAddress(child: BIP32Interface): string {
        return super.getLegacyAddress(child, '1e');
    }

    getWIF(child: BIP32Interface): string {
        return child.toWIF();
    }

    async getAddrDetail(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://digiexplorer.info/api/address/${address}`);
        const balance = BigInt(resp.data['chain_stats']['funded_txo_sum']) - BigInt(resp.data['chain_stats']['spent_txo_sum']);
        const unBalance = BigInt(resp.data['mempool_stats']['funded_txo_sum']) - BigInt(resp.data['mempool_stats']['spent_txo_sum']);
        const isSpent = resp.data['chain_stats']['spent_txo_count'] > 0;
        const spentFlag = isSpent ? "✘" : "✔";

        return { balance: balance, unBalance: unBalance, spentFlag: spentFlag };
    }

    async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://digiexplorer.info/api/address/${address}/utxo`);
        const utxos = [];
        resp.data.forEach(utxo => {
            utxos.push({ txid: utxo['txid'], vout: utxo['vout'], value: utxo['value'] });
        });

        return utxos;
    }

    async getFee(): Promise<number> {
        return 100;
    }

    async sign(tx: any): Promise<void> {
        super.signLegacy(tx);
    }

    isLegacyAddress(address: string): boolean {
        return address.startsWith('D');
    }     
}