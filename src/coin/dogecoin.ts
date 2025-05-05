// import { sha256 } from '@noble/hashes/sha2';
// import { base58 } from '@scure/base';
// import { Util } from '../util';
// import { BIP32Interface } from 'bip32';
// import { Coin } from './coin';

// export class Dogecoin implements Coin {
//     code = 'DOGE';
//     purpose = '44';
//     coin = '3';

//     getAddress(hash160: Buffer): string {
//         const prefix = '00';
//         const hash160Hex = hash160.toString('hex');
//         // double sha256
//         const firstSHA256 = sha256(Buffer.from(prefix + hash160Hex, 'hex'));
//         const secondSHA256 = sha256(firstSHA256);
//         // first 4 bytes is the checksum
//         const checksum = Util.toHexString(secondSHA256).substring(0, 8);
//         // Base58 for P2PKH address
//         const decimal = BigInt("0x" + prefix + hash160Hex + checksum);
//         return '1' + base58.encode(Util.bigIntToUint8Array(decimal));
//     }

//     showDetail(root: BIP32Interface, index: string): void {
//         const child = root.derivePath('m/' + this.purpose + '\'/' + this.coin + '\'/0\'/0/' + index);

//         let detail = '-----------m/' + this.purpose + '\'/' + this.coin + '\'/0\'/0/' + index + '-------------------\n';
    
//         detail += 'WIF: ' + child.toWIF() + '\n';
//         detail += 'Private Key: ' + child.privateKey.toString('hex') + '\n';
//         detail += 'Public Key: ' + child.publicKey.toString('hex') + '\n';
//         detail += 'Legacy Address: ' + this.getAddress(child.identifier) + '\n';
//         detail += '------------------------------------------------\n';
    
//         console.log(detail);
//     }     
// }