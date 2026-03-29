'use strict';
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('FeeDistributor', function () {
  // Math: vol=1_000_000 LTN → fee = vol * 10/10000 = 1000 LTN
  // With stakeAmt=1000 LTN: rpt = 1000e18 / 1000e18 = 1e18 → each token earns 1 LTN

  async function deployFixture() {
    const [owner, alice, bob, reporter] = await ethers.getSigners();

    const LivingToken = await ethers.getContractFactory('LivingToken');
    const ltn = await LivingToken.deploy(owner.address);
    const ltnAddr = await ltn.getAddress();

    const FeeDistributor = await ethers.getContractFactory('FeeDistributor');
    const fd = await FeeDistributor.deploy(ltnAddr, owner.address);
    const fdAddr = await fd.getAddress();

    // Fund staker accounts
    await ltn.transfer(alice.address, ethers.parseEther('10000'));
    await ltn.transfer(bob.address, ethers.parseEther('10000'));

    // Fund reporter (needs LTN to deposit fees via inflow) + approve FeeDistributor
    await ltn.transfer(reporter.address, ethers.parseEther('100000'));
    await ltn.connect(reporter).approve(fdAddr, ethers.MaxUint256);

    // Approve reporter to call inflow()
    await fd.approve(reporter.address);

    return { ltn, fd, ltnAddr, fdAddr, owner, alice, bob, reporter };
  }

  // ── Deployment ────────────────────────────────────────────────────────────

  describe('deployment', function () {
    it('stores the LTN token address', async function () {
      const { fd, ltnAddr } = await loadFixture(deployFixture);
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
    it('reporter is approved in fixture', async function () {
      const { fd, reporter } = await loadFixture(deployFixture);
      expect(await fd.approved(reporter.address)).to.be.true;
    });

    it('non-owner cannot approve a new reporter', async function () {
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

    it('emits Unstaked event', async function () {
      const { ltn, fd, fdAddr, alice } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, amt);
      await fd.connect(alice).stake(amt);
      await expect(fd.connect(alice).unstake(amt))
        .to.emit(fd, 'Unstaked')
        .withArgs(alice.address, amt);
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

    it('inflow with zero totalStaked skips token transfer and RPT stays zero', async function () {
      const { ltn, fd, fdAddr, reporter } = await loadFixture(deployFixture);
      const reporterBefore = await ltn.balanceOf(reporter.address);
      await fd.connect(reporter).inflow(ethers.parseEther('1000000'));
      expect(await fd.rpt()).to.equal(0n);
      // No tokens moved — contract is empty, reporter unchanged
      expect(await ltn.balanceOf(fdAddr)).to.equal(0n);
      expect(await ltn.balanceOf(reporter.address)).to.equal(reporterBefore);
    });

    it('inflow transfers fee LTN from reporter and updates rpt', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, stakeAmt);
      await fd.connect(alice).stake(stakeAmt);

      const vol = ethers.parseEther('1000000');
      const fee = (vol * 10n) / 10000n; // 1000 LTN
      const reporterBefore = await ltn.balanceOf(reporter.address);

      await fd.connect(reporter).inflow(vol);

      // Reporter's balance decreased by fee
      expect(await ltn.balanceOf(reporter.address)).to.equal(reporterBefore - fee);
      // Contract received staked + fee tokens
      expect(await ltn.balanceOf(fdAddr)).to.equal(stakeAmt + fee);
      // RPT updated correctly: 1000e18 / 1000e18 = 1e18
      const expectedRpt = (fee * ethers.parseEther('1')) / stakeAmt;
      expect(await fd.rpt()).to.equal(expectedRpt);
    });

    it('emits Inflow event', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, stakeAmt);
      await fd.connect(alice).stake(stakeAmt);

      const vol = ethers.parseEther('1000000');
      const fee = (vol * 10n) / 10000n;
      await expect(fd.connect(reporter).inflow(vol))
        .to.emit(fd, 'Inflow')
        .withArgs(reporter.address, vol, fee);
    });
  });

  // ── claim() ───────────────────────────────────────────────────────────────

  describe('claim()', function () {
    // Helper: stake → inflow (reporter deposits fee automatically)
    async function stakeAndInflow(ltn, fd, fdAddr, reporter, staker, stakeAmt, vol) {
      await ltn.connect(staker).approve(fdAddr, stakeAmt);
      await fd.connect(staker).stake(stakeAmt);
      await fd.connect(reporter).inflow(vol);
      return (vol * 10n) / 10000n;
    }

    it('single staker claims correct reward', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      const vol = ethers.parseEther('1000000');
      const fee = await stakeAndInflow(ltn, fd, fdAddr, reporter, alice, stakeAmt, vol);

      const before = await ltn.balanceOf(alice.address);
      await fd.connect(alice).claim();
      expect((await ltn.balanceOf(alice.address)) - before).to.equal(fee);
    });

    it('claim resets pending to zero', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      await stakeAndInflow(
        ltn,
        fd,
        fdAddr,
        reporter,
        alice,
        ethers.parseEther('1000'),
        ethers.parseEther('1000000')
      );
      await fd.connect(alice).claim();
      expect(await fd.pending(alice.address)).to.equal(0n);
    });

    it('emits Claimed event', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      const vol = ethers.parseEther('1000000');
      const fee = await stakeAndInflow(ltn, fd, fdAddr, reporter, alice, stakeAmt, vol);
      await expect(fd.connect(alice).claim()).to.emit(fd, 'Claimed').withArgs(alice.address, fee);
    });

    it('claim() is a no-op when there are no pending rewards', async function () {
      const { ltn, fd, fdAddr, alice } = await loadFixture(deployFixture);
      // Alice stakes but no inflow happens
      const amt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, amt);
      await fd.connect(alice).stake(amt);
      // claim should not revert but emit nothing
      await expect(fd.connect(alice).claim()).to.not.emit(fd, 'Claimed');
    });

    it('two stakers receive proportional rewards (1:3 ratio)', async function () {
      const { ltn, fd, fdAddr, alice, bob, reporter } = await loadFixture(deployFixture);

      const aliceStake = ethers.parseEther('1000');
      const bobStake = ethers.parseEther('3000');
      const vol = ethers.parseEther('4000000'); // fee = 4000 LTN = total staked

      await ltn.connect(alice).approve(fdAddr, aliceStake);
      await ltn.connect(bob).approve(fdAddr, bobStake);
      await fd.connect(alice).stake(aliceStake);
      await fd.connect(bob).stake(bobStake);
      await fd.connect(reporter).inflow(vol);

      const fee = (vol * 10n) / 10000n;
      const aliceBefore = await ltn.balanceOf(alice.address);
      const bobBefore = await ltn.balanceOf(bob.address);
      await fd.connect(alice).claim();
      await fd.connect(bob).claim();

      const aliceGot = (await ltn.balanceOf(alice.address)) - aliceBefore;
      const bobGot = (await ltn.balanceOf(bob.address)) - bobBefore;
      expect(aliceGot + bobGot).to.equal(fee);
      expect(bobGot).to.equal(aliceGot * 3n);
    });

    it('second inflow after unstake correctly excludes unstaked tokens', async function () {
      const { ltn, fd, fdAddr, alice, bob, reporter } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('1000');
      const vol = ethers.parseEther('1000000');

      await ltn.connect(alice).approve(fdAddr, amt);
      await ltn.connect(bob).approve(fdAddr, amt);
      await fd.connect(alice).stake(amt);
      await fd.connect(bob).stake(amt);

      // Round 1 — both staked
      await fd.connect(reporter).inflow(vol);
      const fee1 = (vol * 10n) / 10000n;

      // Bob unstakes
      await fd.connect(bob).unstake(amt);

      // Round 2 — only alice staked
      await fd.connect(reporter).inflow(vol);
      const fee2 = (vol * 10n) / 10000n;

      const aliceBefore = await ltn.balanceOf(alice.address);
      await fd.connect(alice).claim();
      const aliceGot = (await ltn.balanceOf(alice.address)) - aliceBefore;

      expect(aliceGot).to.equal(fee1 / 2n + fee2);
    });
  });
});
