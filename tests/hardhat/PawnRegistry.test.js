// tests/hardhat/PawnRegistry.test.js
// Hardhat tests for PawnRegistry contract (BitPawn)
const { expect } = require("chai");
const { ethers }  = require("hardhat");
const { time }    = require("@nomicfoundation/hardhat-network-helpers");

describe("PawnRegistry", () => {
  const LOAN_AMOUNT  = 100_000_000n;  // $100 USDC (6 decimals)
  const INTEREST_BPS = 2000n;          // 20% per 30 days
  const TERM_DAYS    = 30n;
  const COMMIT       = ethers.keccak256(ethers.toUtf8Bytes("customer_zk_commit"));
  const ITEM_HASH    = "ipfs://Qm_test_item";

  async function deploy() {
    const [owner, shop, alice] = await ethers.getSigners();
    const PawnRegistry = await ethers.getContractFactory("PawnRegistry");
    const reg = await PawnRegistry.deploy();
    return { reg, owner, shop, alice };
  }

  // ── Open ticket ────────────────────────────────────────────────────────────

  it("openTicket creates a ticket and emits TicketOpened", async () => {
    const { reg, shop } = await deploy();
    const tx = await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    const receipt = await tx.wait();
    const event   = receipt.logs.find(l => l.fragment?.name === "TicketOpened");
    expect(event).to.not.be.undefined;
    expect(event.args.shop).to.equal(shop.address);
    expect(event.args.loanAmount).to.equal(LOAN_AMOUNT);
  });

  it("openTicket reverts with zero loan", async () => {
    const { reg, shop } = await deploy();
    await expect(
      reg.connect(shop).openTicket(COMMIT, 0n, INTEREST_BPS, TERM_DAYS, ITEM_HASH)
    ).to.be.revertedWith("PR: zero loan");
  });

  it("openTicket reverts with zero commitment", async () => {
    const { reg, shop } = await deploy();
    const zeroCommit = ethers.ZeroHash;
    await expect(
      reg.connect(shop).openTicket(zeroCommit, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH)
    ).to.be.revertedWith("PR: zero commitment");
  });

  it("openTicket increments ticketCount and totalVolume", async () => {
    const { reg, shop } = await deploy();
    await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    expect(await reg.ticketCount()).to.equal(2);
    expect(await reg.totalVolume()).to.equal(LOAN_AMOUNT * 2n);
  });

  it("ticket stores correct fields including 0.5% fee", async () => {
    const { reg, shop } = await deploy();
    const tx = await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    const receipt = await tx.wait();
    const event   = receipt.logs.find(l => l.fragment?.name === "TicketOpened");
    const ticketId = event.args.ticketId;

    const ticket = await reg.tickets(ticketId);
    expect(ticket.customerCommit).to.equal(COMMIT);
    expect(ticket.shop).to.equal(shop.address);
    expect(ticket.loanAmount).to.equal(LOAN_AMOUNT);
    expect(ticket.volumeFee).to.equal((LOAN_AMOUNT * 50n) / 10_000n); // 0.5%
    expect(Number(ticket.status)).to.equal(0); // Active
  });

  it("getShopTickets returns tickets for a shop", async () => {
    const { reg, shop } = await deploy();
    await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    const tickets = await reg.getShopTickets(shop.address);
    expect(tickets.length).to.equal(2);
  });

  // ── Redeem ticket ──────────────────────────────────────────────────────────

  it("redeemTicket marks ticket Redeemed and emits event", async () => {
    const { reg, shop } = await deploy();
    const tx = await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    const receipt  = await tx.wait();
    const ticketId = receipt.logs.find(l => l.fragment?.name === "TicketOpened").args.ticketId;

    await expect(reg.connect(shop).redeemTicket(ticketId))
      .to.emit(reg, "TicketRedeemed");

    const ticket = await reg.tickets(ticketId);
    expect(Number(ticket.status)).to.equal(1); // Redeemed
  });

  it("redeemTicket calculates interest: 20% per 30 days = 20% interest at 1 period", async () => {
    const { reg, shop } = await deploy();
    const tx = await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    const receipt  = await tx.wait();
    const ticketId = receipt.logs.find(l => l.fragment?.name === "TicketOpened").args.ticketId;

    const [totalDue] = await reg.calcDue(ticketId);
    // 1 period (0 days elapsed, so periods = 0/30 + 1 = 1)
    // interest = 100 * 20% * 1 period = 20, total = 120
    const expectedInterest = (LOAN_AMOUNT * INTEREST_BPS * 1n) / 10_000n;
    expect(totalDue).to.equal(LOAN_AMOUNT + expectedInterest);
  });

  it("redeemTicket reverts if ticket is not active", async () => {
    const { reg, shop } = await deploy();
    const tx = await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    const receipt  = await tx.wait();
    const ticketId = receipt.logs.find(l => l.fragment?.name === "TicketOpened").args.ticketId;

    await reg.connect(shop).redeemTicket(ticketId);
    await expect(reg.connect(shop).redeemTicket(ticketId)).to.be.revertedWith("PR: not active");
  });

  // ── Forfeit ticket ─────────────────────────────────────────────────────────

  it("forfeit reverts before ticket expires", async () => {
    const { reg, shop } = await deploy();
    const tx = await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    const receipt  = await tx.wait();
    const ticketId = receipt.logs.find(l => l.fragment?.name === "TicketOpened").args.ticketId;

    await expect(reg.connect(shop).forfeit(ticketId)).to.be.revertedWith("PR: not expired");
  });

  it("forfeit succeeds after term expires", async () => {
    const { reg, shop } = await deploy();
    const tx = await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    const receipt  = await tx.wait();
    const ticketId = receipt.logs.find(l => l.fragment?.name === "TicketOpened").args.ticketId;

    // Advance time past the 30-day term
    await time.increase(31 * 24 * 3600);

    await expect(reg.connect(shop).forfeit(ticketId))
      .to.emit(reg, "TicketForfeited")
      .withArgs(ticketId, LOAN_AMOUNT);

    const ticket = await reg.tickets(ticketId);
    expect(Number(ticket.status)).to.equal(2); // Forfeited
  });

  // ── calcDue ────────────────────────────────────────────────────────────────

  it("calcDue increases with more periods", async () => {
    const { reg, shop } = await deploy();
    const tx = await reg.connect(shop).openTicket(COMMIT, LOAN_AMOUNT, INTEREST_BPS, TERM_DAYS, ITEM_HASH);
    const receipt  = await tx.wait();
    const ticketId = receipt.logs.find(l => l.fragment?.name === "TicketOpened").args.ticketId;

    const [due1] = await reg.calcDue(ticketId);

    // Advance 31 days → 2 periods
    await time.increase(31 * 24 * 3600);
    const [due2] = await reg.calcDue(ticketId);
    expect(due2).to.be.greaterThan(due1);
  });

  // ── Admin ──────────────────────────────────────────────────────────────────

  it("owner can set fee distributor and USDC", async () => {
    const { reg, owner, alice } = await deploy();
    await reg.connect(owner).setFeeDistributor(alice.address);
    await reg.connect(owner).setUSDC(alice.address);
    expect(await reg.feeDistributor()).to.equal(alice.address);
    expect(await reg.usdcToken()).to.equal(alice.address);
  });

  it("non-owner cannot set fee distributor", async () => {
    const { reg, alice } = await deploy();
    await expect(reg.connect(alice).setFeeDistributor(alice.address))
      .to.be.revertedWith("PR: not owner");
  });
});
