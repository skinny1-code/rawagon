'use strict';
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('GoldMint', function () {
  // XAU/USD Chainlink has 8 decimals.
  // $2000/oz = 200_000_000_000 (2000 * 1e8)
  // 1 GTX = 1/100 oz → price() = 2000_00000000 / 100 / 100 = 200_000 USDC units (6 dec)
  const XAU_PRICE_8DEC = 200_000_000_000n; // $2000/oz with 8 decimals
  const USDC_PER_GTX = XAU_PRICE_8DEC / 100n / 100n; // 20_000_000 = $20 in 8-dec space
  // Note: price() returns USDC units in 8-decimal space. For 6-decimal USDC the caller
  // divides further, but GoldMint uses raw price() for mint/redeem math — consistent.

  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    // Mock USDC (6 decimals)
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const usdc = await MockERC20.deploy('USD Coin', 'USDC', 6);
    const usdcAddr = await usdc.getAddress();

    // Mock oracle at $2000/oz
    const MockOracle = await ethers.getContractFactory('MockOracle');
    const oracle = await MockOracle.deploy(XAU_PRICE_8DEC);
    const oracleAddr = await oracle.getAddress();

    // GoldMint
    const GoldMint = await ethers.getContractFactory('GoldMint');
    const gm = await GoldMint.deploy(oracleAddr, usdcAddr, owner.address);
    const gmAddr = await gm.getAddress();

    // Fund alice with USDC
    await usdc.mint(alice.address, 1_000_000_000_000n); // 1M USDC (6 dec)

    return { gm, gmAddr, usdc, usdcAddr, oracle, owner, alice, bob };
  }

  // ── price() ───────────────────────────────────────────────────────────────

  describe('price()', function () {
    it('returns correct price for $2000/oz oracle', async function () {
      const { gm } = await loadFixture(deployFixture);
      expect(await gm.price()).to.equal(USDC_PER_GTX);
    });

    it('reverts when oracle price is zero', async function () {
      const { gm, oracle } = await loadFixture(deployFixture);
      await oracle.setAnswer(0n);
      await expect(gm.price()).to.be.revertedWith('invalid oracle price');
    });

    it('reverts when oracle price is negative', async function () {
      const { gm, oracle } = await loadFixture(deployFixture);
      await oracle.setAnswer(-1n);
      await expect(gm.price()).to.be.revertedWith('invalid oracle price');
    });

    it('reverts when oracle data is stale (>2 hours old)', async function () {
      const { gm, oracle } = await loadFixture(deployFixture);
      // Set updatedAt to 3 hours ago
      const staleTime = (await time.latest()) - 3 * 3600;
      await oracle.setUpdatedAt(staleTime);
      await expect(gm.price()).to.be.revertedWith('stale oracle');
    });

    it('does not revert when oracle is exactly at the max age boundary', async function () {
      const { gm, oracle } = await loadFixture(deployFixture);
      const maxAge = await gm.ORACLE_MAX_AGE();
      // +1 accounts for the setUpdatedAt() tx advancing block.timestamp by 1 second,
      // so that price() sees block.timestamp - updatedAt == ORACLE_MAX_AGE exactly.
      const updatedAt = (await time.latest()) - Number(maxAge) + 1;
      await oracle.setUpdatedAt(updatedAt);
      await expect(gm.price()).to.not.be.reverted;
    });
  });

  // ── mint() ────────────────────────────────────────────────────────────────

  describe('mint()', function () {
    it('mints GTX proportional to USDC deposited minus 0.25% fee', async function () {
      const { gm, gmAddr, usdc, alice } = await loadFixture(deployFixture);
      const uAmt = 1_000_000_000n; // 1000 USDC (6 dec)
      await usdc.connect(alice).approve(gmAddr, uAmt);

      const p = await gm.price();
      const fee = (uAmt * 25n) / 10000n;
      const net = uAmt - fee;
      const expectedGtx = (net * ethers.parseEther('1')) / p;

      await gm.connect(alice).mint(uAmt);
      expect(await gm.balanceOf(alice.address)).to.equal(expectedGtx);
    });

    it('transfers USDC from user to contract', async function () {
      const { gm, gmAddr, usdc, alice } = await loadFixture(deployFixture);
      const uAmt = 1_000_000_000n;
      await usdc.connect(alice).approve(gmAddr, uAmt);
      const before = await usdc.balanceOf(alice.address);
      await gm.connect(alice).mint(uAmt);
      expect(await usdc.balanceOf(alice.address)).to.equal(before - uAmt);
      expect(await usdc.balanceOf(gmAddr)).to.equal(uAmt);
    });

    it('increments reserve by net amount (excl. fee)', async function () {
      const { gm, gmAddr, usdc, alice } = await loadFixture(deployFixture);
      const uAmt = 1_000_000_000n;
      await usdc.connect(alice).approve(gmAddr, uAmt);
      await gm.connect(alice).mint(uAmt);
      const fee = (uAmt * 25n) / 10000n;
      expect(await gm.reserve()).to.equal(uAmt - fee);
    });

    it('reverts when oracle is stale', async function () {
      const { gm, gmAddr, usdc, oracle, alice } = await loadFixture(deployFixture);
      await oracle.setUpdatedAt(0n);
      const uAmt = 1_000_000_000n;
      await usdc.connect(alice).approve(gmAddr, uAmt);
      await expect(gm.connect(alice).mint(uAmt)).to.be.revertedWith('stale oracle');
    });
  });

  // ── redeem() ──────────────────────────────────────────────────────────────

  describe('redeem()', function () {
    async function mintedFixture() {
      const base = await deployFixture();
      const { gm, gmAddr, usdc, alice } = base;
      const uAmt = 1_000_000_000n;
      await usdc.connect(alice).approve(gmAddr, uAmt);
      await gm.connect(alice).mint(uAmt);
      return { ...base, uAmt };
    }

    it('burns GTX and returns USDC at current price', async function () {
      const { gm, gmAddr, usdc, alice } = await loadFixture(mintedFixture);
      const gtxBal = await gm.balanceOf(alice.address);
      const p = await gm.price();
      const expectedUsdc = (gtxBal * p) / ethers.parseEther('1');

      const usdcBefore = await usdc.balanceOf(alice.address);
      await gm.connect(alice).redeem(gtxBal);

      expect(await gm.balanceOf(alice.address)).to.equal(0n);
      expect((await usdc.balanceOf(alice.address)) - usdcBefore).to.equal(expectedUsdc);
    });

    it('decrements reserve by redeemed USDC amount', async function () {
      const { gm, alice } = await loadFixture(mintedFixture);
      const gtxBal = await gm.balanceOf(alice.address);
      const p = await gm.price();
      const uOut = (gtxBal * p) / ethers.parseEther('1');
      const reserveBefore = await gm.reserve();
      await gm.connect(alice).redeem(gtxBal);
      expect(await gm.reserve()).to.equal(reserveBefore - uOut);
    });

    it('reverts when oracle is stale during redeem', async function () {
      const { gm, oracle, alice } = await loadFixture(mintedFixture);
      const gtxBal = await gm.balanceOf(alice.address);
      await oracle.setUpdatedAt(0n);
      await expect(gm.connect(alice).redeem(gtxBal)).to.be.revertedWith('stale oracle');
    });
  });
});
