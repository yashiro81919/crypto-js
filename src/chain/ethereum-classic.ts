import { Helper } from '../helper';
import { EthereumBase } from './ethereum-base';

export class EthereumClassic extends EthereumBase {
    chain = 'Ethereum Classic';
    token = 'ETC';
    purpose = '44';
    coin = '61';
    account = '0';
    change = '0';
    color = '122';

    constructor(helper: Helper) {
        super(helper);
    }

    supportedTokens = [];    

    async getAddrDetail(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://sandbox-api.3xpl.com/ethereum-classic/address/${address}?data=balances&from=all&library=currencies`);
        const balances = resp.data['data']['balances'];
        const tokenMeta = resp.data['library']['currencies'];

        const balance = BigInt(balances['ethereum-classic-main']['ethereum-classic']['balance']);
        const tokens = [];

        // fetch all ERC-20 tokens
        const erc20Obj = balances['ethereum-classic-erc-20'];
        for (const token in erc20Obj) {
            const contract = token.replace('ethereum-classic-erc-20/', '').toLowerCase();
            const erc20 = this.supportedTokens.find(e => e.contract === contract);
            if (erc20) {
                tokens.push({
                    name: erc20.name, address: contract, value: BigInt(erc20Obj[token]['balance']), unit: 10n ** BigInt(tokenMeta[token]['decimals'])
                });
            }
        }

        return { balance: balance, tokens: tokens };
    }

    async getNonce(address: string): Promise<number> {
        const resp = await this.helper.api.post(`https://etc.rivet.link`, {jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [address,'latest'], id: '1'});
        const nonce = resp.data['result'] ? resp.data['result'] : '0';
        return Number(nonce);
    }

    async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://etc.blockscout.com/api/v2/stats`);
        return resp.data['gas_prices']['average'];
    }

    async sign(tx: any): Promise<void> {
        super.sign155(tx, 61n);
    }    
}