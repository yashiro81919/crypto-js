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
        {name: 'USDC', contract: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'}
    ];

    rpcURL = 'https://polygon-bor-rpc.publicnode.com';

    async sign(tx: any): Promise<void> {
        super.sign1559(tx, 137n);
    }    
}