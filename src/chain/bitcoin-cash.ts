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
        const resp = await this.helper.api.get(`https://api.fullstack.cash/v5/electrumx/balance/${address}`);
        const balance =  BigInt(resp.data['balance']['confirmed']);
        const unBalance =  BigInt(resp.data['balance']['unconfirmed']);

        return { balance: balance, unBalance: unBalance, spentFlag: "✔" };
    }

    async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://api.fullstack.cash/v5/electrumx/utxos/${address}`);
        const utxos = [];
        resp.data['utxos'].forEach(utxo => {
            utxos.push({ txid: utxo['tx_hash'], vout: utxo['tx_pos'], value: utxo['value'] });
        });

        return utxos;
    }

    async getFee(): Promise<number> {
        return 1;
    }

    async sign(tx: any): Promise<void> {
        super.signCash(tx);
    }

    isLegacyAddress(address: string): boolean {
        return address.startsWith('1');
    }
}