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
        {name: 'USDS', contract: '0xdc035d45d973e3ec169d2276ddab16f1e407384f'}
    ];

    rpcURL = 'https://ethereum.publicnode.com';

    async sign(tx: any): Promise<void> {
        super.sign1559(tx, 1n);
    }
}