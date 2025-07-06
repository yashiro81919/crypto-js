import { Coin } from './coin/coin';
import { Helper } from './helper';

// this script should be deployed on offline device for signing the transaction with your private key
// make sure a file named "tx" has been put in the same folder which includes the transaction data created in online devices
let coin: Coin;
let helper: Helper;

async function main(): Promise<void> {
    helper = new Helper(false);
    coin = await helper.chooseCoin();
    coin.sign();
}

if (require.main === module) {
    main();
}