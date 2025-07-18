import { input, select } from '@inquirer/prompts';
import { BIP32Factory, BIP32Interface } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { Helper } from './helper';
import { Coin } from './coin/coin';

// this script should be deployed on online device for monitoring your accounts
// accounts are saved in table t_account
const bip32 = BIP32Factory(ecc);
let coin: Coin;
let accountName: string;
let helper: Helper;

async function chooseAccount(dbAccounts: any[]): Promise<BIP32Interface> {
    accountName = await select({
        message: 'Choose account: ', choices: dbAccounts.map(a => {
            return { value: a.name, name: a.name };
        })
    });
    const row = dbAccounts.find(d => d.name === accountName);
    const xpub_key = row.pub_key;
    coin = helper.getCoinInstance(row.coin);

    const node = bip32.fromBase58(xpub_key);

    return bip32.fromPublicKey(node.publicKey, node.chainCode);
}

async function account(): Promise<void> {
    const rows = helper.getAllAccounts();

    let xpub = await chooseAccount(rows);
    while (true) {
        console.log("----------------------------------");
        console.log(`Current account is: [${accountName}]`);
        console.log("----------------------------------");

        const step = await select({
            message: 'Choose your action: ', choices: [
                { value: 0, name: 'list using addresses' },
                { value: 1, name: 'search by index' },
                { value: 2, name: 'change account' },
                { value: 3, name: 'exit' }
            ]
        });

        if (step === 0) {
            await coin.showUsingAddresses(xpub, accountName);
        } else if (step === 1) {
            const index = await input({ message: 'Index: ', required: true, validate: helper.isInteger });
            await coin.showAddressDetail(xpub, accountName, index);
        } else if (step === 2) {
            xpub = await chooseAccount(rows);
        } else if (step === 3) {
            helper.destroy();
            return;
        }
    }
}

// this script should be deployed on online device for creating transaction data
// transaction file will be in current folder and the name is tx
async function createTx(): Promise<void> {
    coin = await helper.chooseCoin();
    coin.createTx();
}

async function main(): Promise<void> {
    helper = new Helper();
    await helper.initResource();

    const step = await select({
        message: 'Choose your action: ', choices: [
            { value: 0, name: 'check account detail information' },
            { value: 1, name: 'create a new transaction' },
            { value: 2, name: 'exit' }
        ]
    });

    if (step === 0) {
        await account();
    } else if (step === 1) {
       await createTx();
    } else if (step === 2) {
        helper.destroy();
        return;
    }    
}

if (require.main === module) {
    main();
}