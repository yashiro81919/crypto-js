import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { BitcoinBase } from './bitcoin-base';

export class Dash extends BitcoinBase {
    chain = 'Dash';
    token = 'DASH';
    purpose = '44';
    coin = '5';
    account = '0';
    change = '0';
    color = '33';

    unit = 'duff/byte';

    constructor(helper: Helper) {
        super(helper);
    }

    getAddress(child: BIP32Interface): string {
        return super.getLegacyAddress(child, '4c');
    }

    getWIF(child: BIP32Interface): string {
        // 0xCC = 204 = Dash mainnet private key prefix
        return super.getCommonWIF(child, 'cc');
    }

    async getAddrDetail(address: string): Promise<any> {
        let resp = await this.helper.api.get(`https://api.blockcypher.com/v1/dash/main/addrs/${address}/balance`);
        const balance = BigInt(resp.data['balance']);
        const unBalance = BigInt(resp.data['unconfirmed_balance']);
        const isSpent = resp.data['total_sent'] > 0;
        const spentFlag = isSpent ? "✘" : "✔";

        return { balance: balance, unBalance: unBalance, spentFlag: spentFlag };
    }

    async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://api.blockcypher.com/v1/dash/main/addrs/${address}?unspentOnly=1&limit=100`);
        const utxos = [];
        if (resp.data['txrefs']) {
            resp.data['txrefs'].forEach(utxo => {
                utxos.push({ txid: utxo['tx_hash'], vout: utxo['tx_output_n'], value: utxo['value'] });
            });
        }
        return utxos;
    }

    async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://api.blockcypher.com/v1/dash/main`);
        return resp.data['low_fee_per_kb'] / 1000;
    }    

    async sign(tx: any): Promise<void> {
        super.signLegacy(tx);
    }

    isLegacyAddress(address: string): boolean {
        return address.startsWith('D');
    }
}