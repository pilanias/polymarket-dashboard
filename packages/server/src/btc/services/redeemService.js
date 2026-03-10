/**
 * Auto-Redeem Service — automatically redeems winning positions after market settlement.
 *
 * Uses the Polymarket CTF (Conditional Token Framework) contract on Polygon
 * to redeem resolved positions back to USDC.
 *
 * Flow:
 * 1. Check data API for redeemable positions (every 5 min)
 * 2. For each redeemable position, call redeemPositions() on the CTF contract
 * 3. USDC flows back to wallet
 *
 * Requires: PRIVATE_KEY and FUNDER_ADDRESS env vars
 */

import { ethers } from 'ethers';

// Polygon PoS RPC (with fallback)
const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

// Polymarket CTF Contract on Polygon
const CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

// Minimal ABI for redeemPositions
const CTF_ABI = [
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external',
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
];

// USDC on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const CHECK_INTERVAL_MS = 5 * 60_000; // check every 5 minutes
let _lastCheckMs = 0;
let _redeemLog = []; // track what we've redeemed

/**
 * Check for and redeem any resolved positions.
 * Call periodically from the main tick loop.
 */
export async function checkAndRedeem() {
  const now = Date.now();
  if (now - _lastCheckMs < CHECK_INTERVAL_MS) return;
  _lastCheckMs = now;

  const privateKey = process.env.PRIVATE_KEY;
  const funderAddress = process.env.FUNDER_ADDRESS;

  if (!privateKey || !funderAddress) return;

  try {
    // 1. Fetch redeemable positions from data API
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      `https://data-api.polymarket.com/positions?user=${funderAddress}&sizeThreshold=0.01&limit=500`,
      { signal: controller.signal, headers: { 'User-Agent': 'PolyDashboard/1.0' } }
    );
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[Redeem] Data API returned ${res.status}`);
      return;
    }

    const positions = await res.json();
    const redeemable = positions.filter(p =>
      p.redeemable && Number(p.size || 0) > 0.01
    );

    if (redeemable.length === 0) return;

    console.log(`[Redeem] Found ${redeemable.length} redeemable positions`);

    // 2. Connect to Polygon (ethers v5)
    const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);
    const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, wallet);

    let redeemed = 0;
    let totalValue = 0;

    for (const pos of redeemable) {
      const conditionId = pos.conditionId;
      if (!conditionId) continue;

      // Skip if we already redeemed this condition recently
      if (_redeemLog.includes(conditionId)) continue;

      try {
        // Redeem both outcome slots (YES=1, NO=2 → indexSets [1, 2])
        const parentCollectionId = ethers.constants.HashZero;
        const indexSets = [1, 2];

        console.log(`[Redeem] Redeeming condition ${conditionId.slice(0, 10)}...`);

        const tx = await ctf.redeemPositions(
          USDC_ADDRESS,
          parentCollectionId,
          conditionId,
          indexSets,
          { gasLimit: 300000 }
        );

        const receipt = await tx.wait();
        console.log(`[Redeem] ✅ Redeemed ${conditionId.slice(0, 10)}... tx: ${receipt.hash}`);

        _redeemLog.push(conditionId);
        // Keep log manageable
        if (_redeemLog.length > 200) _redeemLog = _redeemLog.slice(-100);

        redeemed++;
        totalValue += Number(pos.size || 0);
      } catch (err) {
        console.error(`[Redeem] ❌ Failed to redeem ${conditionId.slice(0, 10)}...: ${err.message}`);
      }
    }

    if (redeemed > 0) {
      console.log(`[Redeem] Redeemed ${redeemed} positions (~$${totalValue.toFixed(2)})`);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[Redeem] Data API timeout');
    } else {
      console.error(`[Redeem] Error: ${err.message}`);
    }
  }
}

/**
 * Get redeem activity log for the status API.
 */
export function getRedeemStatus() {
  return {
    lastCheckAt: _lastCheckMs ? new Date(_lastCheckMs).toISOString() : null,
    redeemCount: _redeemLog.length,
    recentRedeems: _redeemLog.slice(-5),
  };
}
