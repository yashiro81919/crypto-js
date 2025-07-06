import { Coin } from './coin/coin';
import { Helper } from './helper';

// this script should be deployed on online device for creating transaction data
// transaction file will be in current folder and the name is tx
let coin: Coin;
let helper: Helper;

async function main(): Promise<void> {
    helper = new Helper();
    await helper.initResource();
    coin = await helper.chooseCoin();
    coin.createTx();
}

if (require.main === module) {
    main();
}