// tests/hardhat/CardVault.test.js
// Hardhat tests for CardVault (Droppa) contract
const { expect }  = require("chai");
const { ethers }  = require("hardhat");
const { time }    = require("@nomicfoundation/hardhat-network-helpers");

describe("CardVault", () => {
  const DEPOSIT_FEE    = 12_000_000n;  // $12
  const STORAGE_FEE_MO =  1_000_000n;  // $1/month
  const REDEMPTION_FEE = 18_000_000n;  // $18
  const META_HASH      = ethers.keccak256(ethers.toUtf8Bytes("card_metadata"));

  async function deploy() {
    const [owner, operator, alice, bob, feeRecipient] = await ethers.getSigners();
    const MockUSDC    = await ethers.getContractFactory("MockUSDC");
    const usdc        = await MockUSDC.deploy();
    // Deploy a minimal LTN mock — CardVault calls ltn.transferFrom (try/catch, so failure is ok)
    const ltn         = await MockUSDC.deploy(); // use MockUSDC as a stand-in LTN (same interface)

    const CardVault   = await ethers.getContractFactory("CardVault");
    const vault       = await CardVault.deploy(
      await usdc.getAddress(),
      await ltn.getAddress(),
      operator.address,
      feeRecipient.address
    );

    // Give alice USDC and approve
    await usdc.connect(alice).faucet();
    await usdc.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
    // Give bob USDC and approve
    await usdc.connect(bob).faucet();
    await usdc.connect(bob).approve(await vault.getAddress(), ethers.MaxUint256);

    return { vault, usdc, ltn, owner, operator, alice, bob, feeRecipient };
  }

  async function deployAndDeposit() {
    const ctx = await deploy();
    const tx  = await ctx.vault.connect(ctx.alice).requestDeposit(
      "2023 Topps Trout PSA 10", "PSA", 10, 12345678, 5_000_000_000n
    );
    const receipt   = await tx.wait();
    const requestId = receipt.logs.find(l => l.fragment?.name === "DepositRequested").args.requestId;
    return { ...ctx, requestId };
  }

  async function deployAndMint() {
    const ctx = await deployAndDeposit();
    await ctx.vault.connect(ctx.operator).confirmCardReceived(ctx.requestId);
    const tx  = await ctx.vault.connect(ctx.operator).mintDigitalCard(ctx.requestId, META_HASH);
    const receipt = await tx.wait();
    const tokenId = receipt.logs.find(l => l.fragment?.name === "CardDigitized").args.tokenId;
    return { ...ctx, tokenId };
  }

  // ── Deposit fees ───────────────────────────────────────────────────────────

  it("DEPOSIT_FEE is $12 (12_000_000)", async () => {
    const { vault } = await deploy();
    expect(await vault.DEPOSIT_FEE()).to.equal(DEPOSIT_FEE);
  });

  it("STORAGE_FEE_MO is $1/month (1_000_000)", async () => {
    const { vault } = await deploy();
    expect(await vault.STORAGE_FEE_MO()).to.equal(STORAGE_FEE_MO);
  });

  it("REDEMPTION_FEE is $18 (18_000_000)", async () => {
    const { vault } = await deploy();
    expect(await vault.REDEMPTION_FEE()).to.equal(REDEMPTION_FEE);
  });

  // ── requestDeposit ────────────────────────────────────────────────────────

  it("requestDeposit transfers $12 fee and emits DepositRequested", async () => {
    const { vault, usdc, alice, feeRecipient } = await deploy();
    const before = await usdc.balanceOf(feeRecipient.address);

    const tx = await vault.connect(alice).requestDeposit(
      "2023 Topps Trout PSA 10", "PSA", 10, 12345678, 5_000_000_000n
    );
    const receipt = await tx.wait();
    const event   = receipt.logs.find(l => l.fragment?.name === "DepositRequested");
    expect(event).to.not.be.undefined;
    expect(event.args.requester).to.equal(alice.address);
    expect(event.args.fee).to.equal(DEPOSIT_FEE);

    expect(await usdc.balanceOf(feeRecipient.address)).to.equal(before + DEPOSIT_FEE);
    expect(await vault.totalDeposits()).to.equal(1);
  });

  it("requestDeposit increments nextRequestId", async () => {
    const { vault, alice } = await deploy();
    await vault.connect(alice).requestDeposit("Card A", "BGS", 9, 1111, 1_000_000n);
    await vault.connect(alice).requestDeposit("Card B", "PSA", 8, 2222, 2_000_000n);
    expect(await vault.nextRequestId()).to.equal(3); // starts at 1, two created
  });

  // ── confirmCardReceived ───────────────────────────────────────────────────

  it("operator can confirm card received", async () => {
    const { vault, operator, requestId } = await deployAndDeposit();
    await expect(vault.connect(operator).confirmCardReceived(requestId))
      .to.emit(vault, "CardReceived")
      .withArgs(requestId);

    const req = await vault.getRequest(requestId);
    expect(req.cardReceived).to.equal(true);
  });

  it("non-operator cannot confirm receipt", async () => {
    const { vault, alice, requestId } = await deployAndDeposit();
    await expect(vault.connect(alice).confirmCardReceived(requestId))
      .to.be.revertedWith("not operator");
  });

  it("cannot confirm same card twice", async () => {
    const { vault, operator, requestId } = await deployAndDeposit();
    await vault.connect(operator).confirmCardReceived(requestId);
    await expect(vault.connect(operator).confirmCardReceived(requestId))
      .to.be.revertedWith("already received");
  });

  // ── mintDigitalCard ───────────────────────────────────────────────────────

  it("mintDigitalCard emits CardDigitized with correct fields", async () => {
    const { vault, operator, alice, requestId } = await deployAndDeposit();
    await vault.connect(operator).confirmCardReceived(requestId);

    const tx = await vault.connect(operator).mintDigitalCard(requestId, META_HASH);
    const receipt = await tx.wait();
    const event   = receipt.logs.find(l => l.fragment?.name === "CardDigitized");
    expect(event.args.owner).to.equal(alice.address);
    expect(event.args.metadataHash).to.equal(META_HASH);
    expect(await vault.nextTokenId()).to.equal(2n);
  });

  it("mintDigitalCard reverts if card not received", async () => {
    const { vault, operator, requestId } = await deployAndDeposit();
    await expect(vault.connect(operator).mintDigitalCard(requestId, META_HASH))
      .to.be.revertedWith("card not received");
  });

  it("cannot mint same request twice", async () => {
    const { vault, operator, requestId } = await deployAndDeposit();
    await vault.connect(operator).confirmCardReceived(requestId);
    await vault.connect(operator).mintDigitalCard(requestId, META_HASH);
    await expect(vault.connect(operator).mintDigitalCard(requestId, META_HASH))
      .to.be.revertedWith("already minted");
  });

  // ── transferCard ──────────────────────────────────────────────────────────

  it("transferCard with zero price transfers ownership", async () => {
    const { vault, alice, bob, tokenId } = await deployAndMint();
    await vault.connect(alice).transferCard(tokenId, bob.address, 0);
    const card = await vault.getCard(tokenId);
    expect(card.owner).to.equal(bob.address);
  });

  it("transferCard reverts if caller is not owner", async () => {
    const { vault, bob, tokenId } = await deployAndMint();
    await expect(vault.connect(bob).transferCard(tokenId, bob.address, 0))
      .to.be.revertedWith("not owner");
  });

  it("getOwnerCards tracks card ownership", async () => {
    const { vault, alice, tokenId } = await deployAndMint();
    const cards = await vault.getOwnerCards(alice.address);
    expect(cards.length).to.equal(1);
    expect(cards[0]).to.equal(tokenId);
  });

  // ── requestRedemption ────────────────────────────────────────────────────

  it("requestRedemption charges $18 redemption fee", async () => {
    const { vault, usdc, alice, feeRecipient, tokenId } = await deployAndMint();
    const before = await usdc.balanceOf(feeRecipient.address);

    await vault.connect(alice).requestRedemption(tokenId);
    // No storage owed yet (minted at same block), so only REDEMPTION_FEE
    const after = await usdc.balanceOf(feeRecipient.address);
    expect(after - before).to.equal(REDEMPTION_FEE);
  });

  it("requestRedemption sets status to BurnQueued", async () => {
    const { vault, alice, tokenId } = await deployAndMint();
    await vault.connect(alice).requestRedemption(tokenId);
    const card = await vault.getCard(tokenId);
    expect(Number(card.status)).to.equal(4); // BurnQueued
    expect(card.transferable).to.equal(false);
  });

  // ── Storage billing ───────────────────────────────────────────────────────

  it("getStorageOwed returns 0 immediately after mint", async () => {
    const { vault, tokenId } = await deployAndMint();
    expect(await vault.getStorageOwed(tokenId)).to.equal(0);
  });

  it("getStorageOwed returns $1 after 30 days", async () => {
    const { vault, tokenId } = await deployAndMint();
    await time.increase(30 * 24 * 3600 + 1);
    expect(await vault.getStorageOwed(tokenId)).to.equal(STORAGE_FEE_MO);
  });

  it("getStorageOwed returns $3 after 90 days", async () => {
    const { vault, tokenId } = await deployAndMint();
    await time.increase(90 * 24 * 3600 + 1);
    expect(await vault.getStorageOwed(tokenId)).to.equal(STORAGE_FEE_MO * 3n);
  });

  // ── completeRedemption ────────────────────────────────────────────────────

  it("completeRedemption sets status to Redeemed", async () => {
    const { vault, alice, operator, tokenId } = await deployAndMint();
    await vault.connect(alice).requestRedemption(tokenId);
    await vault.connect(operator).completeRedemption(tokenId);
    const card = await vault.getCard(tokenId);
    expect(Number(card.status)).to.equal(5); // Redeemed
  });
});
