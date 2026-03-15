import 'dotenv/config';
import { ClobClient } from '@polymarket/clob-client';
import { Wallet } from 'ethers';

function read(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : '';
}

export function hasLiveCredentials() {
  return Boolean(
    read('PRIVATE_KEY') &&
    read('CLOB_API_KEY') &&
    read('CLOB_SECRET') &&
    read('CLOB_PASSPHRASE')
  );
}

export function getClobClient() {
  if (!hasLiveCredentials()) {
    const missing = ['PRIVATE_KEY', 'CLOB_API_KEY', 'CLOB_SECRET', 'CLOB_PASSPHRASE']
      .filter((k) => !read(k));
    throw new Error(`Live CLOB credentials not configured (missing: ${missing.join(', ')})`);
  }

  const host = process.env.CLOB_HOST || 'https://clob.polymarket.com';
  const chainId = Number(process.env.CHAIN_ID || 137);
  const signer = new Wallet(read('PRIVATE_KEY'));

  const creds = {
    key: read('CLOB_API_KEY'),
    secret: read('CLOB_SECRET'),
    passphrase: read('CLOB_PASSPHRASE'),
  };

  const signatureType = Number(process.env.SIGNATURE_TYPE || 0);
  const funder = process.env.FUNDER_ADDRESS || signer.address;

  return new ClobClient(host, chainId, signer, creds, signatureType, funder);
}

export async function fetchCollateralBalance() {
  const client = getClobClient();
  return await client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
}
