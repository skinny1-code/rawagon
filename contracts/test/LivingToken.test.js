'use strict';
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

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
});
