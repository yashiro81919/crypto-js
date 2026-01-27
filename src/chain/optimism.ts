import { Helper } from '../helper';
import { EthereumBase } from './ethereum-base';

export class Optimism extends EthereumBase {
    chain = 'Optimism';
    token = 'ETH';
    purpose = '44';
    coin = '614';
    account = '0';
    change = '0';
    color = '196';

    constructor(helper: Helper) {
        super(helper);
    }

    supportedTokens = [
        {name: 'OP', contract: '0x4200000000000000000000000000000000000042'},
        {name: 'USDT', contract: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58'},
        {name: 'USDC', contract: '0x0b2c639c533813f4aa9d7837caf62653d097ff85'},
        {name: 'DAI', contract: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'}
    ];

    async getAddrDetail(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://sandbox-api.3xpl.com/optimism/address/${address}?data=balances&from=all&library=currencies`);
        const balances = resp.data['data']['balances'];
        const tokenMeta = resp.data['library']['currencies'];

        const balance = BigInt(balances['optimism-main']['ethereum']['balance']);
        const tokens = [];

        // fetch all ERC-20 tokens
        const erc20Obj = balances['optimism-erc-20'];
        for (const token in erc20Obj) {
            const contract = token.replace('optimism-erc-20/', '').toLowerCase();
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
        const resp = await this.helper.api.post(`https://mainnet.optimism.io`, {jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [address,'latest'], id: '1'});
        const nonce = resp.data['result'] ? resp.data['result'] : '0';
        return Number(nonce);
    }

    async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://explorer.optimism.io/api/v2/stats`);
        return resp.data['gas_prices']['average'];
    }

    async sign(tx: any): Promise<void> {
        super.sign1559(tx, 10n);
    }    
}