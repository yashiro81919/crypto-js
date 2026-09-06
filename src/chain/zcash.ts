import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { BitcoinBase } from './bitcoin-base';

export class Zcash extends BitcoinBase {
    chain = 'Zcash';
    token = 'ZEC';
    purpose = '44';
    coin = '133';
    account = '0';
    change = '0';
    color = '11';

    unit = 'zatoshi/byte';

    constructor(helper: Helper) {
        super(helper);
    }

    getAddress(child: BIP32Interface): string {
        return super.getLegacyAddress(child, '1cb8');
    }

    getWIF(child: BIP32Interface): string {
        // 0x80 = 128 = Zcash mainnet private key prefix
        return super.getCommonWIF(child, '80');
    }

    async getAddrDetail(address: string): Promise<any> {
        let resp = await this.helper.api.get(`https://api.mainnet.cipherscan.app/api/address/${address}?page=1&limit=1`);
        const balance = BigInt(resp.data['balance']);
        const unBalance = 0n;
        const isSpent = resp.data['totalSent'] > 0;
        const spentFlag = isSpent ? "✘" : "✔";

        return { balance: balance, unBalance: unBalance, spentFlag: spentFlag };
    }

    async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://api.mainnet.cipherscan.app/api/address/${address}?page=1&limit=100`);
        const utxos : any[] = [];
        if (resp.data['balance'] > 0) {
            for (const tx of resp.data['transactions']) {
                const subResp = await this.helper.api.get(`https://api.mainnet.cipherscan.app/api/tx/${tx['txid']}`);
                const utxo = subResp.data['outputs'].find((o: any) => o['address'] === address);
                utxos.push({ txid: tx['txid'], vout: utxo['vout_index'], value: utxo['value'] });
                if (tx['netChange'] < 0) {
                    break;
                }                
            };
        }
        return utxos;
    }

    async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://api.mainnet.cipherscan.app/api/network/fees`);
        const fee = resp.data['fees']['standard'];
        return Number(this.helper.bigIntDivide(this.helper.bigIntMultiply(fee.toString(), this.satoshi), 1000n));
    }

    async sign(tx: any): Promise<void> {
        super.signLegacy(tx);
    }

    isLegacyAddress(address: string): boolean {
        return address.startsWith('t1');
    }
}