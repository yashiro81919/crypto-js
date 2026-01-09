# crypto-js
an easy crypto wallet built with Typescript/Javascript for learning purpose.

Actually, I start up this project is because I want to have more control and gain more understanding on mnemonic instead of relying on third party software. 
As mnemonic or private key is very important in crypto world, I want to control it by myself. No one can guarantee that your mnemonic will never leak even if you use a hardware wallet.

So this command-line based application is created for maintaining the mnemonic and create/sign transactions for mainstream cryptocurrencies.
we need 2 devices, one is for online activity such as create transaction/query balance in the account (require internet connections), another one is for offline activity such as check mnemonic/derive private key/sign transaction (it is better this device is always offline to make sure mnemonic/private key has no chance to be compromised).

Setup prd on different platforms:
Windows:
$env:APP_STAGE = "prd"

Linux && Mac:
APP_STAGE=prd
