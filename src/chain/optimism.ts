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
        const resp = await this.helper.api.get(`https://explorer.optimism.io/api/v2/addresses/${address}`);
        const balance = resp.data['coin_balance'] ? BigInt(resp.data['coin_balance']) : 0n;
        const tokens = [];

        if (resp.data['has_tokens']) {
            const respToken = await this.helper.api.get(`https://explorer.optimism.io/api/v2/addresses/${address}/tokens?type=ERC-20`);
            const supportedContract = this.supportedTokens.map(t => t.contract);
            const validTokens = respToken.data['items'].filter(t => supportedContract.includes(t['token']['address_hash'].toLowerCase()));
            for (const token of validTokens) {
                const tokenMeta = token['token'];
                const contract = tokenMeta['address_hash'].toLowerCase();
                const erc20 = this.supportedTokens.find(e => e.contract === contract);
                tokens.push({
                    name: erc20.name, address: contract, value: BigInt(token['value']), unit: 10n ** BigInt(tokenMeta['decimals'])
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