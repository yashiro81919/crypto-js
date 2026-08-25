import { Helper } from '../helper';
import { EthereumBase } from './ethereum-base';

export class HyperEvm extends EthereumBase {
    chain = 'HyperEVM';
    token = 'HYPE';
    purpose = '44';
    coin = '2457';
    account = '0';
    change = '0';
    color = '122';

    constructor(helper: Helper) {
        super(helper);
    }

    supportedTokens = [
        {name: 'USDC', contract: '0xb88339cb7199b77e23db6e890353e22632ba630f'}
    ];

    rpcURL = 'https://rpc.hyperliquid.xyz/evm';

    async sign(tx: any): Promise<void> {
        super.sign1559(tx, 999n);
    }
}