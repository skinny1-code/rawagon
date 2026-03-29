'use strict';
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('LivingToken', function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const LivingToken = await ethers.getContractFactory('LivingToken');
    const ltn = await LivingToken.deploy(owner.address);
    return { ltn, owner, alice, bob };
  }

  async function withBurnerFixture() {
    const base = await deployFixture();
    const { ltn, alice } = base;
    const BURNER_ROLE = await ltn.BURNER_ROLE();
    await ltn.grantRole(BURNER_ROLE, alice.address);
    // fund alice so she has tokens to burn
    await ltn.transfer(alice.address, ethers.parseEther('10'));
    return { ...base, BURNER_ROLE };
  }

  // ── Deployment ────────────────────────────────────────────────────────────

  describe('deployment', function () {
    it('has correct name and symbol', async function () {
      const { ltn } = await loadFixture(deployFixture);
      expect(await ltn.name()).to.equal('Living Token');
      expect(await ltn.symbol()).to.equal('LTN');
    });

    it('mints 400 million LTN to admin', async function () {
      const { ltn, owner } = await loadFixture(deployFixture);
      const expected = ethers.parseEther('400000000');
      expect(await ltn.balanceOf(owner.address)).to.equal(expected);
      expect(await ltn.totalSupply()).to.equal(expected);
    });

    it('grants DEFAULT_ADMIN_ROLE to admin', async function () {
      const { ltn, owner } = await loadFixture(deployFixture);
      expect(await ltn.hasRole(await ltn.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
    });

    it('initialises totalBurned and txCount to zero', async function () {
      const { ltn } = await loadFixture(deployFixture);
      expect(await ltn.totalBurned()).to.equal(0n);
      expect(await ltn.txCount()).to.equal(0n);
    });
  });

  // ── mint() ────────────────────────────────────────────────────────────────

  describe('mint()', function () {
    it('admin can mint to any address', async function () {
      const { ltn, alice } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('1000');
      await ltn.mint(alice.address, amt);
      expect(await ltn.balanceOf(alice.address)).to.equal(amt);
    });

    it('non-admin cannot mint', async function () {
      const { ltn, alice } = await loadFixture(deployFixture);
      await expect(ltn.connect(alice).mint(alice.address, 1n)).to.be.reverted;
    });

    it('cannot mint beyond MAX_SUPPLY', async function () {
      const { ltn, alice } = await loadFixture(deployFixture);
      const max = await ltn.MAX_SUPPLY();
      const remaining = max - (await ltn.totalSupply());
      await expect(ltn.mint(alice.address, remaining + 1n)).to.be.reverted;
    });

    it('can mint up to exactly MAX_SUPPLY', async function () {
      const { ltn, alice } = await loadFixture(deployFixture);
      const max = await ltn.MAX_SUPPLY();
      const remaining = max - (await ltn.totalSupply());
      await ltn.mint(alice.address, remaining);
      expect(await ltn.totalSupply()).to.equal(max);
    });
  });

  // ── burnOnTx() ────────────────────────────────────────────────────────────

  describe('burnOnTx()', function () {
    it('BURNER_ROLE can call burnOnTx', async function () {
      const { ltn, alice } = await loadFixture(withBurnerFixture);
      await expect(ltn.connect(alice).burnOnTx()).to.not.be.reverted;
    });

    it('burns exactly BURN_PER_TX (0.001 LTN) from caller', async function () {
      const { ltn, alice } = await loadFixture(withBurnerFixture);
      const before = await ltn.balanceOf(alice.address);
      const burnAmt = await ltn.BURN_PER_TX();
      await ltn.connect(alice).burnOnTx();
      expect(await ltn.balanceOf(alice.address)).to.equal(before - burnAmt);
    });

    it('increments totalBurned by BURN_PER_TX', async function () {
      const { ltn, alice } = await loadFixture(withBurnerFixture);
      const burnAmt = await ltn.BURN_PER_TX();
      await ltn.connect(alice).burnOnTx();
      expect(await ltn.totalBurned()).to.equal(burnAmt);
    });

    it('increments txCount on each call', async function () {
      const { ltn, alice } = await loadFixture(withBurnerFixture);
      await ltn.connect(alice).burnOnTx();
      await ltn.connect(alice).burnOnTx();
      expect(await ltn.txCount()).to.equal(2n);
    });

    it('emits Burned event with correct args', async function () {
      const { ltn, alice } = await loadFixture(withBurnerFixture);
      const burnAmt = await ltn.BURN_PER_TX();
      await expect(ltn.connect(alice).burnOnTx())
        .to.emit(ltn, 'Burned')
        .withArgs(alice.address, burnAmt, 1n);
    });

    it('non-burner cannot call burnOnTx', async function () {
      const { ltn, bob } = await loadFixture(withBurnerFixture);
      await expect(ltn.connect(bob).burnOnTx()).to.be.reverted;
    });
  });

  // ── ERC20 basics ──────────────────────────────────────────────────────────

  describe('ERC20 transfers', function () {
    it('admin can transfer tokens', async function () {
      const { ltn, alice } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('500');
      await ltn.transfer(alice.address, amt);
      expect(await ltn.balanceOf(alice.address)).to.equal(amt);
    });

    it('approve + transferFrom works', async function () {
      const { ltn, owner, alice, bob } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('100');
      await ltn.approve(alice.address, amt);
      await ltn.connect(alice).transferFrom(owner.address, bob.address, amt);
      expect(await ltn.balanceOf(bob.address)).to.equal(amt);
    });
  });

  // ── setBurnRate() ─────────────────────────────────────────────────────────

  describe('setBurnRate()', function () {
    it('admin can set burn rate within bounds', async function () {
      const { ltn } = await loadFixture(deployFixture);
      const newRate = ethers.parseEther('0.005'); // 5e15
      await ltn.setBurnRate(newRate);
      expect(await ltn.burnPerTx()).to.equal(newRate);
    });

    it('emits BurnRateSet event', async function () {
      const { ltn } = await loadFixture(deployFixture);
      const newRate = ethers.parseEther('0.005');
      await expect(ltn.setBurnRate(newRate)).to.emit(ltn, 'BurnRateSet').withArgs(newRate);
    });

    it('non-admin cannot set burn rate', async function () {
      const { ltn, alice } = await loadFixture(deployFixture);
      await expect(ltn.connect(alice).setBurnRate(1e15)).to.be.reverted;
    });

    it('rate below MIN_BURN reverts', async function () {
      const { ltn } = await loadFixture(deployFixture);
      const minBurn = await ltn.MIN_BURN();
      await expect(ltn.setBurnRate(minBurn - 1n)).to.be.revertedWith('rate out of bounds');
    });

    it('rate above MAX_BURN reverts', async function () {
      const { ltn } = await loadFixture(deployFixture);
      const maxBurn = await ltn.MAX_BURN();
      await expect(ltn.setBurnRate(maxBurn + 1n)).to.be.revertedWith('rate out of bounds');
    });

    it('rate exactly at MIN_BURN is accepted', async function () {
      const { ltn } = await loadFixture(deployFixture);
      const minBurn = await ltn.MIN_BURN();
      await ltn.setBurnRate(minBurn);
      expect(await ltn.burnPerTx()).to.equal(minBurn);
    });

    it('rate exactly at MAX_BURN is accepted', async function () {
      const { ltn } = await loadFixture(deployFixture);
      const maxBurn = await ltn.MAX_BURN();
      await ltn.setBurnRate(maxBurn);
      expect(await ltn.burnPerTx()).to.equal(maxBurn);
    });

    it('burnOnTx uses the new rate after setBurnRate', async function () {
      const { ltn, alice } = await loadFixture(withBurnerFixture);
      const newRate = 2n * 10n ** 15n; // 0.002 LTN
      await ltn.setBurnRate(newRate);
      const before = await ltn.balanceOf(alice.address);
      await ltn.connect(alice).burnOnTx();
      expect(await ltn.balanceOf(alice.address)).to.equal(before - newRate);
    });
  });

  // ── settleEpoch() ─────────────────────────────────────────────────────────

  describe('settleEpoch()', function () {
    it('reverts before epoch has elapsed', async function () {
      const { ltn } = await loadFixture(deployFixture);
      await expect(ltn.settleEpoch()).to.be.revertedWith('epoch not finished');
    });

    it('advances after one epochDuration has passed', async function () {
      const { ltn } = await loadFixture(deployFixture);
      const dur = await ltn.epochDuration();
      await time.increase(dur);
      await expect(ltn.settleEpoch()).to.not.be.reverted;
      expect(await ltn.lastSettledEpoch()).to.equal(1n);
    });

    it('resets epochTxCount to zero after settling', async function () {
      const { ltn, alice } = await loadFixture(withBurnerFixture);
      await ltn.connect(alice).burnOnTx();
      expect(await ltn.epochTxCount()).to.equal(1n);
      const dur = await ltn.epochDuration();
      await time.increase(dur);
      await ltn.settleEpoch();
      expect(await ltn.epochTxCount()).to.equal(0n);
    });

    it('increases burnPerTx by 10% when epochTxCount > highTxThreshold', async function () {
      const { ltn, alice } = await loadFixture(withBurnerFixture);
      // Lower threshold so we can hit it without 10k tx calls
      await ltn.setTxThresholds(2, 1);
      await ltn.connect(alice).burnOnTx();
      await ltn.connect(alice).burnOnTx();
      await ltn.connect(alice).burnOnTx(); // 3 > high=2
      const rateBefore = await ltn.burnPerTx();
      const dur = await ltn.epochDuration();
      await time.increase(dur);
      await ltn.settleEpoch();
      const rateAfter = await ltn.burnPerTx();
      expect(rateAfter).to.equal((rateBefore * 110n) / 100n);
    });

    it('decreases burnPerTx by 10% when epochTxCount < lowTxThreshold', async function () {
      const { ltn } = await loadFixture(withBurnerFixture);
      // Set thresholds so 1 tx is NOT below low threshold — use high=100, low=5 so 0 tx < 5
      await ltn.setTxThresholds(100, 5);
      // epochTxCount = 0, which is < lowTxThreshold=5
      const rateBefore = await ltn.burnPerTx();
      const dur = await ltn.epochDuration();
      await time.increase(dur);
      await ltn.settleEpoch();
      const rateAfter = await ltn.burnPerTx();
      expect(rateAfter).to.equal((rateBefore * 90n) / 100n);
    });

    it('clamps at MAX_BURN when rate would exceed it', async function () {
      const { ltn, alice } = await loadFixture(withBurnerFixture);
      const maxBurn = await ltn.MAX_BURN();
      // Set rate just below MAX so a 10% increase would exceed the ceiling
      await ltn.setBurnRate(maxBurn - 1n);
      // Set thresholds so 3 txs > high (2), triggering an increase
      await ltn.setTxThresholds(2, 1);
      await ltn.connect(alice).burnOnTx();
      await ltn.connect(alice).burnOnTx();
      await ltn.connect(alice).burnOnTx(); // epochTxCount=3 > highTxThreshold=2
      const dur = await ltn.epochDuration();
      await time.increase(dur);
      await ltn.settleEpoch();
      expect(await ltn.burnPerTx()).to.equal(maxBurn);
    });

    it('clamps at MIN_BURN when rate would go below it', async function () {
      const { ltn } = await loadFixture(deployFixture);
      const minBurn = await ltn.MIN_BURN();
      await ltn.setBurnRate(minBurn + 1n); // just above floor
      await ltn.setTxThresholds(100, 50); // epochTxCount=0 < low=50 → decrease
      const dur = await ltn.epochDuration();
      await time.increase(dur);
      await ltn.settleEpoch();
      expect(await ltn.burnPerTx()).to.equal(minBurn);
    });

    it('emits EpochSettled event with correct args', async function () {
      const { ltn } = await loadFixture(deployFixture);
      const dur = await ltn.epochDuration();
      await time.increase(dur);
      const expectedRate = await ltn.burnPerTx(); // unchanged (epochTxCount between thresholds)
      // default thresholds: high=10000, low=1000; epochTxCount=0 < 1000 → rate decreases
      const expectedNew = (expectedRate * 90n) / 100n;
      await expect(ltn.settleEpoch()).to.emit(ltn, 'EpochSettled').withArgs(1n, expectedNew);
    });

    it('cannot settle the same epoch twice', async function () {
      const { ltn } = await loadFixture(deployFixture);
      const dur = await ltn.epochDuration();
      await time.increase(dur);
      await ltn.settleEpoch();
      await expect(ltn.settleEpoch()).to.be.revertedWith('epoch not finished');
    });
  });
});
