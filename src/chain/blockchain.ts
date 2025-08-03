import { BIP32Interface } from "bip32";

export interface Blockchain {
    chain: string;
    token: string;
    purpose: string;
    coin: string;
    account: string;
    change: string;
    color: string;
    showKeyInfo(root: BIP32Interface, index: string): void;
    showAddressDetail(xpub: BIP32Interface, accountName: string, index: string): void;
    showUsingAddresses(xpub: BIP32Interface, accountName: string): void;
    createTx(): void;
    sign(tx: any): void;
}