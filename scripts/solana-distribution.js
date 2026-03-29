/**
 * R3WAGON Solana Distribution
 * Receives USDC from Wormhole bridge and confirms receipt
 * in Ryan Williams' wallet: 6obJ9s7159KRG5eGL2AP67Tkcw18pjkZdaSQJuFaeN78
 *
 * Run: node scripts/solana-distribution.js
 * Requires: @solana/web3.js, @solana/spl-token
 */
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require("@solana/spl-token");

const FOUNDER_WALLET   = new PublicKey("6obJ9s7159KRG5eGL2AP67Tkcw18pjkZdaSQJuFaeN78");
const USDC_MINT_SOLANA = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Circle USDC on Solana
const RPC              = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

async function checkFounderBalance() {
  const conn = new Connection(RPC, "confirmed");

  // SOL balance
  const solBalance = await conn.getBalance(FOUNDER_WALLET);
  console.log("\n=== Ryan Williams — Founder Wallet ===");
  console.log("Address:", FOUNDER_WALLET.toBase58());
  console.log("SOL balance:", (solBalance / LAMPORTS_PER_SOL).toFixed(6), "SOL");

  // USDC balance (bridged from R3NET via Wormhole)
  try {
    const usdcAta = await getAssociatedTokenAddress(USDC_MINT_SOLANA, FOUNDER_WALLET);
    const ataInfo = await conn.getTokenAccountBalance(usdcAta);
    console.log("USDC balance:", ataInfo.value.uiAmount?.toFixed(2) || "0.00", "USDC");
    console.log("USDC ATA:", usdcAta.toBase58());
  } catch(e) {
    console.log("USDC: No account yet (will be created on first bridge)");
  }

  console.log("\nWormhole bridge receipts from R3NET chain 720701");
  console.log("Auto-bridges when R3NET queue >= $1,000 USDC");
  console.log("\nYear 2 founder allocation: $4,368,940/year");
  console.log("Monthly average:             $364,078/month");
  console.log("Distribution: 15% of each entity revenue, bridged monthly");
}

checkFounderBalance().catch(console.error);
