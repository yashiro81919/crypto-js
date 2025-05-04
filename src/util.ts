import { select } from '@inquirer/prompts';

export class Util {
    static COIN_CONFIG = {
        "BTC": { "purpose": "84", "coin": "0", "account": "0", "change": "0", "witness_type": "segwit" },
        "LTC": { "purpose": "84", "coin": "2", "account": "0", "change": "0", "witness_type": "segwit" },
        "DOGE": { "purpose": "44", "coin": "3", "account": "0", "change": "0", "witness_type": "legacy" },
        "XMR": { "purpose": "44", "coin": "128", "account": "0", "change": "0", "witness_type": "legacy" },
        "TRX": { "purpose": "44", "coin": "195", "account": "0", "change": "0", "witness_type": "legacy" },
    };

    static TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

    static DB_FILE = "acc.db";

    static isInteger(value: any): boolean {
        const num = Number(value);
        return !isNaN(num) && Number.isInteger(num);
    }

    static async chooseCoin(): Promise<any> {
        const coins = [];
        for (const coinName in this.COIN_CONFIG) {
            coins.push(coinName);
        }

        const coinName = await select({
            message: 'Choose coin: ', choices: coins
        });

        console.log("----------------------------------");
        console.log("Current coin is: [" + coinName + "]");
        console.log("----------------------------------");

        return coinName;
    }
}