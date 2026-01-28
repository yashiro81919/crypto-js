import { Helper } from '../helper';
import { EthereumBase } from './ethereum-base';

export class Arbitrum extends EthereumBase {
    chain = 'Arbitrum One';
    token = 'ETH';
    purpose = '44';
    coin = '9001';
    account = '0';
    change = '0';
    color = '39';

    constructor(helper: Helper) {
        super(helper);
    }

    supportedTokens = [
        {name: 'ARB', contract: '0x912ce59144191c1204e64559fe8253a0e49e6548'},
        {name: 'USDT', contract: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'},
        {name: 'USDC', contract: '0xaf88d065e77c8cc2239327c5edb3a432268e5831'},
        {name: 'USDS', contract: '0x6491c05a82219b8d1479057361ff1654749b876b'},
        {name: 'DAI', contract: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'}
    ];

    async getAddrDetail(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://arbitrum.blockscout.com/api/v2/addresses/${address}`);
        const balance = resp.data['coin_balance'] ? BigInt(resp.data['coin_balance']) : 0n;
        const tokens = [];

        if (resp.data['has_tokens']) {
            const respToken = await this.helper.api.get(`https://arbitrum.blockscout.com/api/v2/addresses/${address}/tokens?type=ERC-20`);
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
        const resp = await this.helper.api.post(`https://arb1.arbitrum.io/rpc`, {jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [address,'latest'], id: '1'});
        const nonce = resp.data['result'] ? resp.data['result'] : '0';
        return Number(nonce);
    }

    async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://arbitrum.blockscout.com/api/v2/stats`);
        return resp.data['gas_prices']['average'];
    }
    
    async sign(tx: any): Promise<void> {
        super.sign1559(tx, 42161n);
    }
}