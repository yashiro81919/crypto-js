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
        const resp = await this.helper.api.get(`https://blockbook.bch.zelcore.io/api/v2/address/${address}`);
        const balance =  BigInt(resp.data['balance']);
        const unBalance =  BigInt(resp.data['unconfirmedBalance']);
        const isSpent = resp.data['totalSent'] > 0;
        const spentFlag = isSpent ? "✘" : "✔";        

        return { balance: balance, unBalance: unBalance, spentFlag: spentFlag };
    }

    async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://blockbook.bch.zelcore.io/api/v2/utxo/${address}`);
        const utxos : any[] = [];
        resp.data.forEach((utxo: any) => {
            utxos.push({ txid: utxo['txid'], vout: utxo['vout'], value: utxo['value'] });
        });

        return utxos;
    }

    async getFee(): Promise<number> {
        return 1;
    }

    async sign(tx: any, keyMap: Map<string, string>): Promise<void> {
        super.signCash(tx, keyMap);
    }

    isLegacyAddress(address: string): boolean {
        return address.startsWith('1');
    }
}