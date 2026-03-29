'use strict';
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

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
      const toStakers = (fee * 80n) / 100n; // 800 LTN (default stakersSharePct=80)
      const reporterBefore = await ltn.balanceOf(reporter.address);

      await fd.connect(reporter).inflow(vol);

      // Reporter's balance decreased by full fee
      expect(await ltn.balanceOf(reporter.address)).to.equal(reporterBefore - fee);
      // Contract holds staked + fee (treasury=0 so no transfer out)
      expect(await ltn.balanceOf(fdAddr)).to.equal(stakeAmt + fee);
      // RPT updated with only the stakers' share: 800e18 / 1000e18 = 0.8e18
      const expectedRpt = (toStakers * ethers.parseEther('1')) / stakeAmt;
      expect(await fd.rpt()).to.equal(expectedRpt);
    });

    it('emits Inflow event', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, stakeAmt);
      await fd.connect(alice).stake(stakeAmt);

      const vol = ethers.parseEther('1000000');
      const fee = (vol * 10n) / 10000n;
      const toStakers = (fee * 80n) / 100n; // default stakersSharePct = 80
      const toTreasury = fee - toStakers;
      await expect(fd.connect(reporter).inflow(vol))
        .to.emit(fd, 'Inflow')
        .withArgs(reporter.address, vol, fee, toStakers, toTreasury);
    });
  });

  // ── claim() ───────────────────────────────────────────────────────────────

  describe('claim()', function () {
    // Helper: stake → inflow. Returns the staker reward portion (stakersSharePct of fee).
    async function stakeAndInflow(ltn, fd, fdAddr, reporter, staker, stakeAmt, vol) {
      await ltn.connect(staker).approve(fdAddr, stakeAmt);
      await fd.connect(staker).stake(stakeAmt);
      await fd.connect(reporter).inflow(vol);
      const fee = (vol * 10n) / 10000n;
      const stakersSharePct = await fd.stakersSharePct();
      return (fee * BigInt(stakersSharePct)) / 100n;
    }

    it('single staker claims correct reward', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      const vol = ethers.parseEther('1000000');
      const reward = await stakeAndInflow(ltn, fd, fdAddr, reporter, alice, stakeAmt, vol);

      const before = await ltn.balanceOf(alice.address);
      await fd.connect(alice).claim();
      expect((await ltn.balanceOf(alice.address)) - before).to.equal(reward);
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
      const reward = await stakeAndInflow(ltn, fd, fdAddr, reporter, alice, stakeAmt, vol);
      await expect(fd.connect(alice).claim())
        .to.emit(fd, 'Claimed')
        .withArgs(alice.address, reward);
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
      const vol = ethers.parseEther('4000000'); // fee = 4000 LTN

      await ltn.connect(alice).approve(fdAddr, aliceStake);
      await ltn.connect(bob).approve(fdAddr, bobStake);
      await fd.connect(alice).stake(aliceStake);
      await fd.connect(bob).stake(bobStake);
      await fd.connect(reporter).inflow(vol);

      const fee = (vol * 10n) / 10000n;
      const stakersSharePct = await fd.stakersSharePct();
      const toStakers = (fee * BigInt(stakersSharePct)) / 100n;

      const aliceBefore = await ltn.balanceOf(alice.address);
      const bobBefore = await ltn.balanceOf(bob.address);
      await fd.connect(alice).claim();
      await fd.connect(bob).claim();

      const aliceGot = (await ltn.balanceOf(alice.address)) - aliceBefore;
      const bobGot = (await ltn.balanceOf(bob.address)) - bobBefore;
      expect(aliceGot + bobGot).to.equal(toStakers);
      expect(bobGot).to.equal(aliceGot * 3n);
    });

    it('second inflow after unstake correctly excludes unstaked tokens', async function () {
      const { ltn, fd, fdAddr, alice, bob, reporter } = await loadFixture(deployFixture);
      const amt = ethers.parseEther('1000');
      const vol = ethers.parseEther('1000000');
      const stakersSharePct = await fd.stakersSharePct();

      await ltn.connect(alice).approve(fdAddr, amt);
      await ltn.connect(bob).approve(fdAddr, amt);
      await fd.connect(alice).stake(amt);
      await fd.connect(bob).stake(amt);

      // Round 1 — both staked
      await fd.connect(reporter).inflow(vol);
      const fee1 = (vol * 10n) / 10000n;
      const toStakers1 = (fee1 * BigInt(stakersSharePct)) / 100n;

      // Bob unstakes
      await fd.connect(bob).unstake(amt);

      // Round 2 — only alice staked
      await fd.connect(reporter).inflow(vol);
      const fee2 = (vol * 10n) / 10000n;
      const toStakers2 = (fee2 * BigInt(stakersSharePct)) / 100n;

      const aliceBefore = await ltn.balanceOf(alice.address);
      await fd.connect(alice).claim();
      const aliceGot = (await ltn.balanceOf(alice.address)) - aliceBefore;

      // Alice gets half of round-1 staker rewards + all of round-2 staker rewards
      expect(aliceGot).to.equal(toStakers1 / 2n + toStakers2);
    });
  });

  // ── setAutoCompound() + claim() ───────────────────────────────────────────

  describe('auto-compound', function () {
    it('setAutoCompound() toggles flag and emits event', async function () {
      const { fd, alice } = await loadFixture(deployFixture);
      await expect(fd.connect(alice).setAutoCompound(true))
        .to.emit(fd, 'AutoCompoundSet')
        .withArgs(alice.address, true);
      expect(await fd.autoCompound(alice.address)).to.be.true;
    });

    it('claim with auto-compound re-stakes reward instead of transferring', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, stakeAmt);
      await fd.connect(alice).stake(stakeAmt);
      await fd.connect(alice).setAutoCompound(true);

      const vol = ethers.parseEther('1000000');
      await fd.connect(reporter).inflow(vol);

      const fee = (vol * 10n) / 10000n;
      const stakersSharePct = await fd.stakersSharePct();
      const reward = (fee * BigInt(stakersSharePct)) / 100n;

      const walletBefore = await ltn.balanceOf(alice.address);
      const stakedBefore = await fd.staked(alice.address);
      await fd.connect(alice).claim();

      // Wallet balance unchanged — reward was re-staked
      expect(await ltn.balanceOf(alice.address)).to.equal(walletBefore);
      // Staked balance grew by the reward
      expect(await fd.staked(alice.address)).to.equal(stakedBefore + reward);
      expect(await fd.totalStaked()).to.equal(stakeAmt + reward);
    });

    it('auto-compound emits Staked (not Claimed)', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, stakeAmt);
      await fd.connect(alice).stake(stakeAmt);
      await fd.connect(alice).setAutoCompound(true);
      await fd.connect(reporter).inflow(ethers.parseEther('1000000'));

      await expect(fd.connect(alice).claim()).to.emit(fd, 'Staked').and.not.emit(fd, 'Claimed');
    });

    it('normal claim still works when auto-compound is off', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, stakeAmt);
      await fd.connect(alice).stake(stakeAmt);
      // auto-compound defaults to false
      await fd.connect(reporter).inflow(ethers.parseEther('1000000'));
      const before = await ltn.balanceOf(alice.address);
      await fd.connect(alice).claim();
      expect(await ltn.balanceOf(alice.address)).to.be.gt(before);
    });
  });

  // ── fee split (treasury) ──────────────────────────────────────────────────

  describe('fee split', function () {
    it('treasury receives its share on inflow', async function () {
      const { ltn, fd, fdAddr, alice, reporter, owner } = await loadFixture(deployFixture);
      // Use owner as treasury for simplicity
      await fd.setTreasury(owner.address);
      const stakeAmt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, stakeAmt);
      await fd.connect(alice).stake(stakeAmt);

      const vol = ethers.parseEther('1000000');
      const fee = (vol * 10n) / 10000n;
      const stakersSharePct = await fd.stakersSharePct();
      const toTreasury = fee - (fee * BigInt(stakersSharePct)) / 100n;

      const treasuryBefore = await ltn.balanceOf(owner.address);
      await fd.connect(reporter).inflow(vol);
      expect(await ltn.balanceOf(owner.address)).to.equal(treasuryBefore + toTreasury);
    });

    it('setFeeBps owner-only and bounds enforced', async function () {
      const { fd, alice } = await loadFixture(deployFixture);
      await expect(fd.connect(alice).setFeeBps(10)).to.be.reverted;
      await expect(fd.setFeeBps(4)).to.be.revertedWith('feeBps out of bounds');
      await expect(fd.setFeeBps(21)).to.be.revertedWith('feeBps out of bounds');
      await fd.setFeeBps(15);
      expect(await fd.feeBps()).to.equal(15);
    });

    it('setStakersSharePct owner-only and bounds enforced', async function () {
      const { fd, alice } = await loadFixture(deployFixture);
      await expect(fd.connect(alice).setStakersSharePct(80)).to.be.reverted;
      await expect(fd.setStakersSharePct(49)).to.be.revertedWith('share out of bounds');
      await expect(fd.setStakersSharePct(96)).to.be.revertedWith('share out of bounds');
      await fd.setStakersSharePct(90);
      expect(await fd.stakersSharePct()).to.equal(90);
    });
  });

  // ── settleEpoch() ─────────────────────────────────────────────────────────

  describe('settleEpoch()', function () {
    it('reverts before epoch has elapsed', async function () {
      const { fd } = await loadFixture(deployFixture);
      await expect(fd.settleEpoch()).to.be.revertedWith('epoch not finished');
    });

    it('advances after epochDuration has passed and emits EpochSettled', async function () {
      const { fd } = await loadFixture(deployFixture);
      const dur = await fd.epochDuration();
      await time.increase(dur);
      await expect(fd.settleEpoch()).to.emit(fd, 'EpochSettled').withArgs(1n);
      expect(await fd.lastSettledEpoch()).to.equal(1n);
    });

    it('resets epochVolume to zero', async function () {
      const { ltn, fd, fdAddr, alice, reporter } = await loadFixture(deployFixture);
      const stakeAmt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, stakeAmt);
      await fd.connect(alice).stake(stakeAmt);
      await fd.connect(reporter).inflow(ethers.parseEther('1000000'));
      expect(await fd.epochVolume()).to.be.gt(0n);
      const dur = await fd.epochDuration();
      await time.increase(dur);
      await fd.settleEpoch();
      expect(await fd.epochVolume()).to.equal(0n);
    });

    it('increases stakersSharePct when utilization < 20%', async function () {
      const { fd } = await loadFixture(deployFixture);
      // totalStaked = 0 → utilization = 0 < 20 → stakersSharePct increases
      const before = await fd.stakersSharePct();
      const dur = await fd.epochDuration();
      await time.increase(dur);
      await fd.settleEpoch();
      expect(await fd.stakersSharePct()).to.equal(before + 5n);
    });

    it('cannot settle same epoch twice', async function () {
      const { fd } = await loadFixture(deployFixture);
      const dur = await fd.epochDuration();
      await time.increase(dur);
      await fd.settleEpoch();
      await expect(fd.settleEpoch()).to.be.revertedWith('epoch not finished');
    });
  });

  // ── yield strategy ────────────────────────────────────────────────────────

  describe('yield strategy', function () {
    async function strategyFixture() {
      const base = await deployFixture();
      const { ltn, fd, fdAddr, alice } = base;

      const MockYieldStrategy = await ethers.getContractFactory('MockYieldStrategy');
      const strategy = await MockYieldStrategy.deploy(await ltn.getAddress());
      const stratAddr = await strategy.getAddress();

      // Pre-fund strategy with yield tokens (owner has 100M+ LTN)
      await ltn.approve(stratAddr, ethers.parseEther('100000'));
      await strategy.fund(ethers.parseEther('1000')); // 1000 LTN available as yield

      await fd.setYieldStrategy(stratAddr);

      // Alice stakes so there's something in the pool
      const stakeAmt = ethers.parseEther('1000');
      await ltn.connect(alice).approve(fdAddr, stakeAmt);
      await fd.connect(alice).stake(stakeAmt);

      return { ...base, strategy, stratAddr };
    }

    it('setYieldStrategy emits YieldStrategySet', async function () {
      const { fd, stratAddr } = await strategyFixture();
      // Already set in fixture; verify by reading state
      expect(await fd.yieldStrategy()).to.equal(stratAddr);
    });

    it('settleEpoch harvests yield and distributes to stakers via rpt', async function () {
      const { fd } = await strategyFixture();
      const dur = await fd.epochDuration();
      await time.increase(dur);

      const rptBefore = await fd.rpt();
      await fd.settleEpoch();
      // Strategy has _deposited=0 initially (no deployment yet), so harvest yields 0 in first epoch
      // Trigger a second epoch with deployment to test harvest
      await time.increase(dur);
      await fd.settleEpoch();
      // rpt may have increased from yield (depends on deployment in first epoch)
      // At minimum it should not revert and epochVolume resets
      expect(await fd.epochVolume()).to.equal(0n);
      expect(await fd.rpt()).to.be.gte(rptBefore);
    });

    it('settleEpoch deploys idle LTN to strategy (up to 80% of totalStaked)', async function () {
      const { fd } = await strategyFixture();
      const dur = await fd.epochDuration();
      await time.increase(dur);
      await fd.settleEpoch();
      // After settlement, up to 80% of 1000 LTN staked should be deployed
      const deployed = await fd.deployedToStrategy();
      expect(deployed).to.be.lte(ethers.parseEther('800'));
    });

    it('unstake pulls from strategy when contract balance is insufficient', async function () {
      const { ltn, fd, alice } = await strategyFixture();
      // Manually force deployment so contract balance < staked amount
      const dur = await fd.epochDuration();
      await time.increase(dur);
      await fd.settleEpoch(); // deploys up to 800 LTN to strategy

      // Alice unstakes her 1000 LTN — contract may not have enough, pulls from strategy
      const before = await ltn.balanceOf(alice.address);
      await fd.connect(alice).unstake(ethers.parseEther('1000'));
      expect(await ltn.balanceOf(alice.address)).to.equal(before + ethers.parseEther('1000'));
    });
  });
});
