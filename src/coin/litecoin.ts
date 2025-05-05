// import { bech32 } from '@scure/base';
// import { Util } from '../util';
// import { BIP32Interface } from 'bip32';
// import { Coin } from './coin';

// export class Litecoin implements Coin {
//     code = 'LTC';
//     purpose = '84';
//     coin = '2';

//     getAddress(hash160: Buffer): string {
//         const hrp = 'ltc';
//         const hash160Hex = hash160.toString('hex');
//         // Bench32 encoding
//         const byteNumbers = Util.hexTo5bitBytes(hash160Hex);
//         byteNumbers.unshift(0);
//         return bech32.encode(hrp, byteNumbers);
//     }

//     showDetail(root: BIP32Interface, index: string): void {
//         const child = root.derivePath('m/' + this.purpose + '\'/' + this.coin + '\'/0\'/0/' + index);

//         let detail = '-----------m/' + this.purpose + '\'/' + this.coin + '\'/0\'/0/' + index + '-------------------\n';
    
//         detail += 'WIF: ' + child.toWIF() + '\n';
//         detail += 'Private Key: ' + child.privateKey.toString('hex') + '\n';
//         detail += 'Public Key: ' + child.publicKey.toString('hex') + '\n';
//         detail += 'Segwit Address: ' + this.getAddress(child.identifier) + '\n';
//         detail += '------------------------------------------------\n';
    
//         console.log(detail);
//     }
// }