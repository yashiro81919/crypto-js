import { BIP32Interface } from "bip32";

export interface Coin {
    code: string;
    purpose: string;
    coin: string;
    account: string;
    change: string;
    getAddress(hash160: Buffer): string;
    showKeyInfo(root: BIP32Interface, index: string): void;
    showAddressDetail(xpub: BIP32Interface, accountName: string, index: string): void;
    showUsingAddresses(xpub: BIP32Interface, accountName: string): void;
}