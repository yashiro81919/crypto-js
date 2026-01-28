import { Helper } from '../helper';
import { EthereumBase } from './ethereum-base';

export class Ethereum extends EthereumBase {
    chain = 'Ethereum';
    token = 'ETH';
    purpose = '44';
    coin = '60';
    account = '0';
    change = '0';
    color = '103';

    constructor(helper: Helper) {
        super(helper);
    }

    supportedTokens = [
        {name: 'USDT', contract: '0xdac17f958d2ee523a2206206994597c13d831ec7'},
        {name: 'USDC', contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'},
        {name: 'USDS', contract: '0xdc035d45d973e3ec169d2276ddab16f1e407384f'},
        {name: 'DAI', contract: '0x6b175474e89094c44da98b954eedeac495271d0f'}
    ];

    async getAddrDetail(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://eth.blockscout.com/api/v2/addresses/${address}`);
        const balance = resp.data['coin_balance'] ? BigInt(resp.data['coin_balance']) : 0n;
        const tokens = [];

        if (resp.data['has_tokens']) {
            const respToken = await this.helper.api.get(`https://eth.blockscout.com/api/v2/addresses/${address}/tokens?type=ERC-20`);
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
        const resp = await this.helper.api.post(`https://ethereum.therpc.io`, {jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [address,'latest'], id: '1'});
        const nonce = resp.data['result'] ? resp.data['result'] : '0';
        return Number(nonce);
    }

    async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://eth.blockscout.com/api/v2/stats`);
        return resp.data['gas_prices']['average'];
    }

    async sign(tx: any): Promise<void> {
        super.sign1559(tx, 1n);
    }
}