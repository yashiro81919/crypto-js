import { Helper } from '../helper';
import { EthereumBase } from './ethereum-base';

export class EthereumClassic extends EthereumBase {
    chain = 'Ethereum Classic';
    token = 'ETC';
    purpose = '44';
    coin = '61';
    account = '0';
    change = '0';
    color = '118';

    constructor(helper: Helper) {
        super(helper);
    }

    supportedTokens : { name: string, contract: string }[] = [];

    rpcURL = 'https://etc.rivet.link';

    async sign(tx: any): Promise<void> {
        super.sign155(tx, 61n);
    }    
}