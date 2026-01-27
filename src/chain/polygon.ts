import { Helper } from '../helper';
import { EthereumBase } from './ethereum-base';

export class Polygon extends EthereumBase {
    chain = 'Polygon';
    token = 'POL';
    purpose = '44';
    coin = '966';
    account = '0';
    change = '0';
    color = '99';

    constructor(helper: Helper) {
        super(helper);
    }

    supportedTokens = [
        {name: 'USDT', contract: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f'},
        {name: 'USDC', contract: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'},
        {name: 'DAI', contract: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063'}
    ];

    async getAddrDetail(address: string): Promise<any> {
        const resp = await this.helper.api.get(`https://sandbox-api.3xpl.com/polygon/address/${address}?data=balances&from=all&library=currencies`);
        const balances = resp.data['data']['balances'];
        const tokenMeta = resp.data['library']['currencies'];

        const balance = BigInt(balances['polygon-main']['matic']['balance']);
        const tokens = [];

        // fetch all ERC-20 tokens
        const erc20Obj = balances['polygon-erc-20'];
        for (const token in erc20Obj) {
            const contract = token.replace('polygon-erc-20/', '').toLowerCase();
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
        const resp = await this.helper.api.post(`https://polygon-rpc.com`, {jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [address,'latest'], id: '1'});
        const nonce = resp.data['result'] ? resp.data['result'] : '0';
        return Number(nonce);
    }

    async getFee(): Promise<number> {
        const resp = await this.helper.api.get(`https://polygon.blockscout.com/api/v2/stats`);
        return resp.data['gas_prices']['average'];
    }

    async sign(tx: any): Promise<void> {
        super.sign1559(tx, 137n);
    }    
}