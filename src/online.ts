import { input, select, confirm } from '@inquirer/prompts';
import { BIP32Factory, BIP32Interface } from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';
import { Helper } from './helper';
import { Blockchain } from './chain/blockchain';

// this script should be deployed on online device for monitoring your accounts
// accounts are saved in table t_account
const bip32 = BIP32Factory(ecc);
let blockchain: Blockchain;
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
    blockchain = helper.getBlockchain(row.coin_type);

    const node = bip32.fromBase58(xpub_key);

    return bip32.fromPublicKey(node.publicKey, node.chainCode);
}

async function account(): Promise<void> {
    const rows = helper.getAllAccounts();

    let xpub = await chooseAccount(rows);
    while (true) {
        console.log("----------------------------------");
        console.log(`Current account is: [${accountName}] | Blockchain is: [${blockchain.chain}]`);
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
            await blockchain.showUsingAddresses(xpub, accountName);
        } else if (step === 1) {
            const index = await input({ message: 'Index: ', required: true, validate: helper.isInteger });
            await blockchain.showAddressDetail(xpub, accountName, index);
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
    blockchain = await helper.chooseChain();
    blockchain.createTx();
}

async function managePortfolio(): Promise<void> {
    const step = await select({
        message: 'Choose your action: ', choices: [
            { value: 0, name: 'check total balance' },
            { value: 1, name: 'update cost' }
        ]
    });

    if (step === 0) {
        const coinMap = new Map<string, string>();
        coinMap.set('BTC', 'bitcoin');
        coinMap.set('BCH', 'bitcoin-cash');
        coinMap.set('LTC', 'litecoin');
        coinMap.set('DOGE', 'dogecoin');
        coinMap.set('ETH', 'ethereum');
        coinMap.set('ETC', 'ethereum-classic');
        coinMap.set('POL', 'matic');
        coinMap.set('OP', 'optimism-erc-20/0x4200000000000000000000000000000000000042');
        coinMap.set('ARB', 'arbitrum-one-erc-20/0x912ce59144191c1204e64559fe8253a0e49e6548');

        const resp = await helper.api.get(`https://sandbox-api.3xpl.com/?library=blockchains,rates(usd)`);
        const rates = resp.data['library']['rates']['now'];

        let total = 0;

        const rows = helper.aggAllAccounts();
        const tokens = helper.aggAllTokens();
        console.log(`-----------Total Assets-------------------`);
        rows.forEach(row => {
            const blockchain = helper.getBlockchain(row['coin_type']);
            const balance = row['balance'];
            const accName = row['name'];
            const price = rates[coinMap.get(blockchain.token)]['usd'];
            const amount = (balance * price).toFixed(2);
            total += Number(amount);
            helper.print(blockchain.color, `|${blockchain.chain}|${accName}|${blockchain.token}|${balance}|${price}|${amount}`);
            tokens.filter(t => t['name'] === accName).forEach(t => {
                const coinStr = coinMap.get(t['symbol']);
                // support OP and ARB, others are stable coin, so always 1
                const tokenPrice = coinStr ? rates[coinStr]['usd'] : 1;
                const tokenAmount = (t['balance'] * tokenPrice).toFixed(2);
                total += Number(tokenAmount);
                helper.print(blockchain.color, `|${blockchain.chain}|${accName}|${t['symbol']}|${t['balance']}|${tokenPrice}|${tokenAmount}`);
            });
        });
        console.log(`------------------------------------------`);
        helper.print('255', `Total Balance: ${total.toFixed(2)}`);
        const cost = helper.getCost();
        helper.print('255', `Total Cost: ${cost.toFixed(2)}`);
        helper.print('255', `Total Profit: ${(total - cost).toFixed(2)}`);
    } else if (step === 1) {
        const cost = helper.getCost();

        const mode = await select({
            message: 'Choose Update Mode: ', choices: [
                { value: 0, name: 'append new cost' },
                { value: 1, name: 'overwrite existing cost' }
            ]
        });

        const newCost = await input({ message: `Type new cost: `, default: cost.toString(), validate: helper.isFloat });
        helper.updateCost(Number(newCost), mode === 0);

        const currCost = helper.getCost();
        helper.print('255', `Total Cost: ${currCost}`);
    }
}

async function manageAccount(): Promise<void> {
    const step = await select({
        message: 'Choose your action: ', choices: [
            { value: 0, name: 'add account' },
            { value: 1, name: 'remove account' }
        ]
    });

    if (step === 0) {
        blockchain = await helper.chooseChain();
        const name = await input({ message: 'Type account name: ', required: true });
        const pubKey = await input({ message: 'Type bip32 public key: ', required: true });
        helper.addAccount(name, pubKey, blockchain.coin);
    } else if (step === 1) {
        const rows = helper.getAllAccounts();
        accountName = await select({
            message: 'Choose account to remove: ', choices: rows.map(a => {
                return { value: a.name, name: a.name };
            })
        });

        const status = await confirm({ message: 'Continue to remove account: ' });
        if (status) {
            helper.deleteAccount(accountName);
        }
    }
}

async function main(): Promise<void> {
    helper = new Helper();
    await helper.initResource();

    const step = await select({
        message: 'Choose your action: ', choices: [
            { value: 0, name: 'check account detail information' },
            { value: 1, name: 'create a new transaction' },
            { value: 2, name: 'manage protfolio' },
            { value: 3, name: 'manage accounts' },
            { value: 4, name: 'exit' }
        ]
    });

    if (step === 0) {
        await account();
    } else if (step === 1) {
        await createTx();
    } else if (step === 2) {
        await managePortfolio();
    } else if (step === 3) {
        await manageAccount();
    } else if (step === 4) {
        helper.destroy();
        return;
    }
}

if (require.main === module) {
    main();
}