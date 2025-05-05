import * as fs from 'fs/promises';
import { input, select, password } from '@inquirer/prompts';
import { aes256gcmDecode } from './aes';
import { Util } from './util';
import * as bip39 from 'bip39';
import { BIP32Factory, BIP32Interface } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { Coin } from './coin/coin';

const bip32 = BIP32Factory(ecc);
const seedFilePath = 'seed';
const masterPublicFilePath = 'public';
let coin: Coin;
let mnemonic: string;

async function getKey(): Promise<BIP32Interface> {
    const pass = await password({ message: '25th word: ', mask: '*' });
    const seed = bip39.mnemonicToSeedSync(mnemonic, pass);
    const root = bip32.fromSeed(seed);

    const pub = root.derivePath('m/' + coin.purpose + '\'/' + coin.coin + '\'/0\'');
    fs.writeFile(masterPublicFilePath, pub.neutered().toBase58(), 'utf8');
    return root;
}

async function searchIndex(root: BIP32Interface): Promise<void> {
    const index = await input({ message: 'Index: ', required: true, validate: Util.isInteger });
    coin.showDetail(root, index);
}

async function changeAccount(): Promise<BIP32Interface> {
    coin = await Util.chooseCoin();
    return getKey();
}

async function main(): Promise<void> {
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

if (require.main === module) {
    main();
}