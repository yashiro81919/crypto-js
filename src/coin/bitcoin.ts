import { bech32 } from '@scure/base';
import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { Coin } from './coin';

export class Bitcoin implements Coin {
    code = 'BTC';
    purpose = '84';
    coin = '0';
    account = '0';
    change = '0';
    helper: Helper;

    constructor(helper: Helper) {
        this.helper = helper;
    }

    getAddress(hash160: Buffer): string {
        const hrp = 'bc';
        const hash160Hex = hash160.toString('hex');
        // Bech32 encoding
        const byteNumbers = this.helper.hexTo5bitBytes(hash160Hex);
        byteNumbers.unshift(0);
        return bech32.encode(hrp, byteNumbers);
    }

    showKeyInfo(root: BIP32Interface, index: string): void {
        const child = root.derivePath('m/' + this.purpose + '\'/' + this.coin + '\'/' + this.account + '\'/' + this.change + '/' + index);

        let detail = '-----------m/' + this.purpose + '\'/' + this.coin + '\'/' + this.account + '\'/' + this.change + '/' + index + '-------------------\n';

        detail += 'WIF: ' + child.toWIF() + '\n';
        detail += 'Private Key: ' + child.privateKey.toString('hex') + '\n';
        detail += 'Public Key: ' + child.publicKey.toString('hex') + '\n';
        detail += 'Segwit Address: ' + this.getAddress(child.identifier) + '\n';
        detail += '------------------------------------------------\n';

        console.log(detail);
    }

    async showAddressDetail(xpub: BIP32Interface, accountName: string, index: string): Promise<void> {
        const ck = xpub.derivePath(String(this.account) + '/' + index);
        const address = this.getAddress(ck.identifier);

        const addr = await this.getAddr(address);

        console.log('|' + index + '|' + address + '|' + addr.balance + '|' + addr.spentFlag);

        const utxos = await this.getUtxos(address);
        utxos.forEach(utxo => console.log(utxo));       

        this.helper.updateDb(accountName, index, addr.balance + addr.unBalance);
    }

    showUsingAddresses(xpub: BIP32Interface, accountName: string): void {
        let total = 0;
        const using_addrs = this.helper.getUsingAddresses(accountName);

        using_addrs.forEach(async a => {
            const ck = xpub.derivePath(String(this.account) + '/' + a.idx);
            const address = this.getAddress(ck.identifier);

            const addr = await this.getAddr(address);

            console.log('|' + a.idx + '|' + address + '|' + addr.balance + '|' + addr.spentFlag);
            total += addr.balance;

            this.helper.updateDb(accountName, a.idx, addr.balance + addr.unBalance);
        });

        console.log('Total Balance:' + total);
    }

    private async getAddr(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://mempool.space/api/address/${address}`);
        const balance = resp.data['chain_stats']['funded_txo_sum'] - resp.data['chain_stats']['spent_txo_sum'];
        const unBalance = resp.data['mempool_stats']['funded_txo_sum'] - resp.data['mempool_stats']['spent_txo_sum'];
        const isSpent = resp.data['chain_stats']['spent_txo_count'] > 0;
        const spentFlag = isSpent ? "✘" : "✔";

        return {balance: balance, unBalance: unBalance, spentFlag: spentFlag};
    }

    private async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://mempool.space/api/address/${address}/utxo`);
        const utxos = [];
        resp.data.forEach(utxo => {
            utxos.push({txid: utxo['txid'], vout: utxo['vout'], value: utxo['value']});
        });

        return utxos;        
    }
}