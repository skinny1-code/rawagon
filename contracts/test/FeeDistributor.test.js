'use strict';
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('FeeDistributor', function () {
  // Stake 1 LTN = parseEther('1'), vol units match LTN wei for clean math.
  // With stakeAmt=1000 LTN and vol=1_000_000 LTN:
  //   fee = vol * 10 / 10000 = 1000 LTN  (exactly equals stakeAmt — tidy test numbers)
  //   rpt = fee * 1e18 / totalStaked = 1e18 → each staker earns 1 LTN per 1 staked LTN

  async function deployFixture() {
    const [owner, alice, bob, reporter] = await ethers.getSigners();

    const LivingToken = await ethers.getContractFactory('LivingToken');
    const ltn = await LivingToken.deploy(owner.address);
    const ltnAddr = await ltn.getAddress();

    const FeeDistributor = await ethers.getContractFactory('FeeDistributor');
    const fd = await FeeDistributor.deploy(ltnAddr, owner.address);
    const fdAddr = await fd.getAddress();

    // Fund test accounts
    await ltn.transfer(alice.address, ethers.parseEther('10000'));
    await ltn.transfer(bob.address, ethers.parseEther('10000'));

    // Approve reporter
    await fd.approve(reporter.address);

    return { ltn, fd, ltnAddr, fdAddr, owner, alice, bob, reporter };
  }

  // ── Deployment ────────────────────────────────────────────────────────────

  describe('deployment', function () {
    it('stores the LTN token address', async function () {
      const { ltn, fd, ltnAddr } = await loadFixture(deployFixture);
      expect(await fd.ltn()).to.equal(ltnAddr);
    });

    it('sets owner', async function () {
      const { fd, owner } = await loadFixture(deployFixture);
      expect(await fd.owner()).to.equal(owner.address);
    });

    it('initialises rpt and totalStaked to zero', async function () {
      const { fd } = await loadFixture(deployFixture);
      expect(await fd.rpt()).to.equal(0n);
      expect(await fd.totalStaked()).to.equal(0n);
    });
  });

  // ── approve() ────────────────────────────────────────────────────────────

  describe('approve()', function () {
    it('reporter is already approved in fixture', async function () {
      const { fd, reporter } = await loadFixture(deployFixture);
      expect(await fd.approved(reporter.address)).to.be.true;
    });

    it('non-owner cannot approve', async function () {
      const { fd, alice } = await loadFixture(deployFixture);
      await expect(fd.connect(alice).approve(alice.address)).to.be.reverted;
    });
  });

  // ── stake() ───────────────────────────────────────────────────────────────

  describe('stake()', function () {
    it('transfers LTN into contract and records staked amount', async function () {
      const { ltn, fd, fdAddr, alice } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, amt);
      await fd.connect(alice).stake(amt);

      expect(await fd.staked(alice.address)).to.equal(amt);
      expect(await fd.totalStaked()).to.equal(amt);
      expect(await ltn.balanceOf(fdAddr)).to.equal(amt);
    });

    it('emits Staked event', async function () {
      const { ltn, fd, fdAddr, alice } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, amt);
      await expect(fd.connect(alice).stake(amt)).to.emit(fd, 'Staked').withArgs(alice.address, amt);
    });

    it('accumulates stake from multiple calls', async function () {
      const { ltn, fd, fdAddr, alice } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('500');
      await ltn.connect(alice).approve(fdAddr, amt * 2n);
      await fd.connect(alice).stake(amt);
      await fd.connect(alice).stake(amt);
      expect(await fd.staked(alice.address)).to.equal(amt * 2n);
    });
  });

  // ── unstake() ─────────────────────────────────────────────────────────────

  describe('unstake()', function () {
    it('returns LTN and reduces staked balance', async function () {
      const { ltn, fd, fdAddr, alice } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, amt);
      await fd.connect(alice).stake(amt);

      const before = await ltn.balanceOf(alice.address);
      await fd.connect(alice).unstake(amt);

      expect(await fd.staked(alice.address)).to.equal(0n);
      expect(await fd.totalStaked()).to.equal(0n);
      expect(await ltn.balanceOf(alice.address)).to.equal(before + amt);
    });

    it('partial unstake leaves correct remainder', async function () {
      const { ltn, fd, fdAddr, alice } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, amt);
      await fd.connect(alice).stake(amt);
      await fd.connect(alice).unstake(ethers.parseEther('400'));
      expect(await fd.staked(alice.address)).to.equal(ethers.parseEther('600'));
    });
  });

  // ── inflow() ─────────────────────────────────────────────────────────────

  describe('inflow()', function () {
    it('unapproved caller is rejected', async function () {
      const { fd, alice } = await loadFixture(deployFixture);
      await expect(fd.connect(alice).inflow(ethers.parseEther('1000'))).to.be.reverted;
    });

    it('inflow with zero totalStaked does not update rpt', async function () {
      const { fd, reporter } = await loadFixture(deployFixture);
      await fd.connect(reporter).inflow(ethers.parseEther('1000000'));
      expect(await fd.rpt()).to.equal(0n);
    });

    it('inflow updates rpt correctly when stakers exist', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, stakeAmt);
      await fd.connect(alice).stake(stakeAmt);

      // vol=1_000_000 → fee=1000 → rpt = 1000e18/1000e18 = 1e18
      const vol = ethers.parseEther('1000000');
      await fd.connect(reporter).inflow(vol);

      const expectedFee = (vol * 10n) / 10000n;
      const expectedRpt = (expectedFee * ethers.parseEther('1')) / stakeAmt;
      expect(await fd.rpt()).to.equal(expectedRpt);
    });
  });

  // ── claim() ───────────────────────────────────────────────────────────────

  describe('claim()', function () {
    // Helper: stake → fund contract → report volume → return expected reward
    async function stakeAndInflow(ltn, fd, fdAddr, staker, stakeAmt, vol, owner) {
      await ltn.connect(staker).approve(fdAddr, stakeAmt);
      await fd.connect(staker).stake(stakeAmt);
      const fee = (vol * 10n) / 10000n;
      // Seed the distributor with reward tokens (protocol fee income)
      await ltn.transfer(fdAddr, fee);
      return fee;
    }

    it('single staker claims correct reward', async function () {
      const { ltn, fd, fdAddr, owner, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      const vol = ethers.parseEther('1000000');
      const fee = await stakeAndInflow(ltn, fd, fdAddr, alice, stakeAmt, vol, owner);
      await fd.connect(reporter).inflow(vol);

      const before = await ltn.balanceOf(alice.address);
      await fd.connect(alice).claim();
      expect((await ltn.balanceOf(alice.address)) - before).to.equal(fee);
    });

    it('claim resets pending to zero', async function () {
      const { ltn, fd, fdAddr, owner, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      const vol = ethers.parseEther('1000000');
      await stakeAndInflow(ltn, fd, fdAddr, alice, stakeAmt, vol, owner);
      await fd.connect(reporter).inflow(vol);
      await fd.connect(alice).claim();
      expect(await fd.pending(alice.address)).to.equal(0n);
    });

    it('emits Claimed event', async function () {
      const { ltn, fd, fdAddr, owner, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      const vol = ethers.parseEther('1000000');
      const fee = await stakeAndInflow(ltn, fd, fdAddr, alice, stakeAmt, vol, owner);
      await fd.connect(reporter).inflow(vol);
      await expect(fd.connect(alice).claim()).to.emit(fd, 'Claimed').withArgs(alice.address, fee);
    });

    it('two stakers receive proportional rewards (1:3 ratio)', async function () {
      const { ltn, fd, fdAddr, owner, alice, bob, reporter } = await loadFixture(deployFixture);

      // Alice 1000 : Bob 3000 = 1:3
      const aliceStake = ethers.parseEther('1000');
      const bobStake = ethers.parseEther('3000');
      const vol = ethers.parseEther('4000000'); // fee = 4000 LTN = totalStaked

      await ltn.connect(alice).approve(fdAddr, aliceStake);
      await ltn.connect(bob).approve(fdAddr, bobStake);
      await fd.connect(alice).stake(aliceStake);
      await fd.connect(bob).stake(bobStake);

      const fee = (vol * 10n) / 10000n; // 4000 LTN
      await ltn.transfer(fdAddr, fee);
      await fd.connect(reporter).inflow(vol);

      const aliceBefore = await ltn.balanceOf(alice.address);
      const bobBefore = await ltn.balanceOf(bob.address);
      await fd.connect(alice).claim();
      await fd.connect(bob).claim();

      const aliceGot = (await ltn.balanceOf(alice.address)) - aliceBefore;
      const bobGot = (await ltn.balanceOf(bob.address)) - bobBefore;

      // Total claimed = total fee (no rounding loss with clean numbers)
      expect(aliceGot + bobGot).to.equal(fee);
      // Bob gets exactly 3x alice
      expect(bobGot).to.equal(aliceGot * 3n);
    });

    it('second inflow after unstake correctly excludes unstaked tokens', async function () {
      const { ltn, fd, fdAddr, owner, alice, bob, reporter } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('1000');
      const vol = ethers.parseEther('1000000');

      await ltn.connect(alice).approve(fdAddr, amt);
      await ltn.connect(bob).approve(fdAddr, amt);
      await fd.connect(alice).stake(amt);
      await fd.connect(bob).stake(amt);

      // Round 1 — both staked
      const fee1 = (vol * 10n) / 10000n;
      await ltn.transfer(fdAddr, fee1);
      await fd.connect(reporter).inflow(vol);

      // Bob unstakes before round 2
      await fd.connect(bob).unstake(amt);

      // Round 2 — only alice staked
      const fee2 = (vol * 10n) / 10000n;
      await ltn.transfer(fdAddr, fee2);
      await fd.connect(reporter).inflow(vol);

      const aliceBefore = await ltn.balanceOf(alice.address);
      await fd.connect(alice).claim();
      const aliceGot = (await ltn.balanceOf(alice.address)) - aliceBefore;

      // Alice: half of round1 + all of round2
      const expected = fee1 / 2n + fee2;
      expect(aliceGot).to.equal(expected);
    });
  });
});
