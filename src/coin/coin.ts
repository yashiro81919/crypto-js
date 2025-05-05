import { BIP32Interface } from "bip32";

export interface Coin {
    code: string;
    purpose: string;
    coin: string;
    account: string;
    change: string;
    getAddress(hash160: Buffer): string;
    showDetail(root: BIP32Interface, index: string): void;
}