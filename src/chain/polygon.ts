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

    rpcURL = 'https://polygon-bor-rpc.publicnode.com';

    async sign(tx: any, keyMap: Map<string, string>): Promise<void> {
        super.sign1559(tx, 137n, keyMap);
    }    
}