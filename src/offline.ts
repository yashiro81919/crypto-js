import * as fs from 'fs/promises';
import { input, select, password } from '@inquirer/prompts';
import { aes256gcmEncode, aes256gcmDecode } from './aes';
import { Helper } from './helper';
import * as bip39 from 'bip39';
import { BIP32Factory, BIP32Interface } from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';
import { Coin } from './coin/coin';

const bip32 = BIP32Factory(ecc);
const seedFilePath = 'seed';
const newSeedfilePath = 'new_seed';
const masterPublicFilePath = 'public';
let coin: Coin;
let mnemonic: string;
let helper: Helper;

async function getKey(): Promise<BIP32Interface> {
    const pass = await password({ message: '25th word: ', mask: '*' });
    const seed = bip39.mnemonicToSeedSync(mnemonic, pass);
    const root = bip32.fromSeed(seed);

    const pub = root.derivePath('m/' + coin.purpose + '\'/' + coin.coin + '\'/' + coin.account + '\'');
    fs.writeFile(masterPublicFilePath, pub.neutered().toBase58(), 'utf8');
    return root;
}

async function searchIndex(root: BIP32Interface): Promise<void> {
    const index = await input({ message: 'Index: ', required: true, validate: helper.isInteger });
    await coin.showKeyInfo(root, index);
}

async function changeAccount(): Promise<BIP32Interface> {
    coin = await helper.chooseCoin();
    return getKey();
}

async function generateSeed(): Promise<void> {
    // generate new seed
    const mnemonic = bip39.generateMnemonic(256);
    const seed = bip39.mnemonicToSeedSync(mnemonic).toString('hex');
    const entropy = bip39.mnemonicToEntropy(mnemonic);

    // encrypt seed and save to file
    const passphrase = await input({ message: 'Passphrase: ', required: true });
    const encrypted = aes256gcmEncode(Buffer.from(mnemonic, 'utf8'), passphrase);

    console.log('Mnemonic:', mnemonic);
    console.log('Seed:', seed);
    console.log('Entropy:', entropy);

    fs.writeFile(newSeedfilePath, encrypted.toString('hex'), 'utf8');
}

async function account(): Promise<void> {
    const data = await fs.readFile(seedFilePath, 'utf8');
    const passphrase = await password({ message: 'Passphrase: ', mask: '*' });
    mnemonic = aes256gcmDecode(Buffer.from(data, 'hex'), passphrase).toString('utf8');
    let root = await changeAccount();

    while (true) {
        const step = await select({
            message: 'Choose your action: ', choices: [
                { value: 0, name: 'search' },
                { value: 1, name: 'change account' },
                { value: 2, name: 'exit' }
            ]
        });

        if (step === 0) {
            await searchIndex(root);
        } else if (step === 1) {
            root = await changeAccount();
        } else if (step === 2) {
            return;
        }
    }
}

// this script should be deployed on offline device for signing the transaction with your private key
// make sure a file named "tx" has been put in the same folder which includes the transaction data created in online devices
async function sign(): Promise<void> {
    const data = await fs.readFile(helper.TX_FILE, 'utf8');
    const tx = JSON.parse(data);
    const coin = helper.getCoinInstance(tx['coin']);
    console.log("----------------------------------");
    console.log(`Current coin is: [${tx['coin']}]`);
    console.log("----------------------------------");
    coin.sign(tx);
}

async function main(): Promise<void> {
    helper = new Helper();
    
    const step = await select({
        message: 'Choose your action: ', choices: [
            { value: 0, name: 'check account private key' },
            { value: 1, name: 'sign transaction with private key' },
            { value: 2, name: 'generate new seed' },
            { value: 3, name: 'exit' }
        ]
    });

    if (step === 0) {
        await account();
    } else if (step === 1) {
       await sign();
    } else if (step === 2) {
       await generateSeed();
    } else if (step === 3) {
        return;
    }    
}

if (require.main === module) {
    main();
}