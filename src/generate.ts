import * as bip39 from 'bip39';
import { input } from '@inquirer/prompts';
import { aes256gcmEncode } from './aes';
import * as fs from 'fs/promises';

const filePath = 'new_seed';

async function main(): Promise<void> {
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

    fs.writeFile(filePath, encrypted.toString('hex'), 'utf8');
}

if (require.main === module) {
    main();
}