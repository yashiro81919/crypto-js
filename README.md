# How the crypto-js Project Works

## Overview

This is a __command-line cryptocurrency wallet__ written in TypeScript, built for __educational purposes__. The core philosophy (from the README) is __self-custody__: the author wants full control over mnemonics and private keys rather than relying on third-party wallets or hardware wallets.

The project uses a __two-device air-gapped security model__:

- __Online device__ — queries balances, creates transactions (needs internet)
- __Offline device__ — stores mnemonic, derives private keys, signs transactions (should stay offline)

## Key Concepts

### 1. Air-Gapped Two-Device Design

- __`src/online.ts`__ — runs on the online device. Handles:

  - Viewing account/address balances and UTXOs
  - __Creating unsigned transactions__ (written to a `tx` file)
  - Managing accounts (stored encrypted in a local SQLite DB `acc.db`)
  - Portfolio tracking (total balance, cost, profit via price API)

- __`src/offline.ts`__ — runs on the offline device. Handles:

  - Reading the encrypted mnemonic from the `seed` file
  - Deriving private keys / addresses (BIP32/BIP39)
  - __Signing transactions__ created by the online device (reads `tx`, writes signed tx to `sigtx`)
  - Generating new seeds

The flow: online device creates an unsigned `tx` file → physically transfer it to the offline device → offline device signs it with the private key → transfer the signed `sigtx` back → broadcast.

### 2. Mnemonic & Key Derivation

- Uses __BIP39__ (`bip39`) to generate mnemonics and derive seeds.
- Uses __BIP32__ (`bip32` + `@bitcoinerlab/secp256k1`) for hierarchical deterministic key derivation.
- Standard derivation path BIP44-style: `m/{purpose}'/{coin}'/{account}'/{change}/{index}`
- The seed is encrypted with __AES-256-GCM__ (`src/aes.ts`) using a passphrase. Encryption uses PBKDF2 (100k iterations, SHA-256) for key derivation, and stores `salt + nonce + authTag + ciphertext` in the file.
- The offline app also supports a __"25th word"__ passphrase for extra seed protection.

### 3. Chain Abstraction (`src/chain/`)

All blockchains implement the `Blockchain` interface (`blockchain.ts`), which defines:

- Metadata: `chain`, `token`, `purpose`, `coin`, `account`, `change`, `color`
- Methods: `showKeyInfo`, `showAddressDetail`, `showUsingAddresses`, `createTx`, `sign`

There are two base abstract classes that most chains extend:

- __`bitcoin-base.ts`__ — Bitcoin family (BTC, BCH, DASH, DOGE, LTC, DGB). Implements:

  - Legacy (P2PKH) and SegWit (bech32) address generation
  - UTXO-based transaction creation/signing
  - Three signing variants: `signLegacy`, `signSigwit`, `signCash` (BCH fork-id)
  - Custom transaction serialization/raw tx building with double-SHA256 hashing

- __`ethereum-base.ts`__ — Ethereum family (ETH, ETC, POL). Implements:

  - keccak-256 address derivation
  - RLP-encoded transactions with EIP-155 (legacy) and EIP-1559 (type 2) support
  - Native ETH transfers and ERC-20 token transfers (`transfer(address,uint256)` ABI encoding)

Concrete chains (e.g., `bitcoin-cash.ts`) just define their BIP44 coin values and chain-specific API endpoints (for balance/UTXO/fee queries).

## Architecture Flow

1. __`Helper`__ (`helper.ts`) is the central service. It:

   - Maintains a __chain registry__ (11 chains: BTC, ETH, POL, LTC, DOGE, BCH, ETC, DASH, DGB, XMR, TRX)
   - Manages the SQLite DB (`better-sqlite3`) for accounts, addresses, tokens, and cost tracking
   - Provides an axios API client (with optional SOCKS5 proxy in non-prod mode)
   - Provides crypto utilities: double-SHA256, byte-order conversions, compact-size encoding, base58check, bigint math helpers

2. __Account management__: Public keys (xpub) are stored encrypted in the DB (AES-256-GCM keyed by the account name). Only the online device needs these to derive/verify addresses.

3. __Monero__ (`monero.ts`) is the outlier — it doesn't use the Bitcoin/Ethereum base classes since Monero has a totally different (CryptoNote) address and transaction model.

## Build & Deploy

- `npm run build` → compiles TypeScript with `tsc`
- `npm run deploy` → builds then runs `minify-obfuscate.js` (uses terser + javascript-obfuscator to obfuscate the compiled output)
- Environment setup: set `APP_STAGE=prd` for production (disables the SOCKS5 proxy); otherwise it assumes a local proxy at `127.0.0.1:1080` for testing.

Windows:
$env:APP_STAGE = "prd"

Linux && Mac:
APP_STAGE=prd

## Summary

In short, this project is a __learning-focused, self-custody CLI wallet__ that separates __online transaction creation/portfolio monitoring__ from __offline key storage/signing__ across two devices, with a clean `Blockchain` abstraction supporting both UTXO-based (Bitcoin) and account-based (Ethereum) chains.


