'use strict';
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('EmployeeVault', function () {
  // A known 32-byte commitment (keccak of a test string)
  const COMMITMENT = ethers.keccak256(ethers.toUtf8Bytes('test-credentials-v1'));
  const COMMITMENT2 = ethers.keccak256(ethers.toUtf8Bytes('test-credentials-v2'));
  const BAD_PROOF = ethers.keccak256(ethers.toUtf8Bytes('wrong'));

  async function deployFixture() {
    const [owner, employer, employee, stranger] = await ethers.getSigners();
    const EmployeeVault = await ethers.getContractFactory('EmployeeVault');
    const vault = await EmployeeVault.deploy();
    return { vault, owner, employer, employee, stranger };
  }

  async function enrolledFixture() {
    const base = await deployFixture();
    const { vault, employer, employee } = base;
    await vault.connect(employee).enroll(employer.address, COMMITMENT);
    return base;
  }

  // ── enroll() ──────────────────────────────────────────────────────────────

  describe('enroll()', function () {
    it('stores commitment, employer, and marks active', async function () {
      const { vault, employer, employee } = await loadFixture(deployFixture);
      await vault.connect(employee).enroll(employer.address, COMMITMENT);

      expect(await vault.commit(employee.address)).to.equal(COMMITMENT);
      expect(await vault.employer(employee.address)).to.equal(employer.address);
      expect(await vault.active(employee.address)).to.be.true;
    });

    it('emits Enrolled event', async function () {
      const { vault, employer, employee } = await loadFixture(deployFixture);
      await expect(vault.connect(employee).enroll(employer.address, COMMITMENT))
        .to.emit(vault, 'Enrolled')
        .withArgs(employee.address, employer.address);
    });

    it('cannot enroll twice', async function () {
      const { vault, employer, employee } = await loadFixture(enrolledFixture);
      await expect(
        vault.connect(employee).enroll(employer.address, COMMITMENT2)
      ).to.be.revertedWith('already enrolled');
    });

    it('rejects empty (zero) commitment', async function () {
      const { vault, employer, employee } = await loadFixture(deployFixture);
      await expect(
        vault.connect(employee).enroll(employer.address, ethers.ZeroHash)
      ).to.be.revertedWith('empty commitment');
    });
  });

  // ── verify() ─────────────────────────────────────────────────────────────

  describe('verify()', function () {
    it('returns true for correct 32-byte proof and valid scope', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      // proof = raw 32 bytes matching the stored commitment
      expect(await vault.connect(employee).verify(COMMITMENT, 1)).to.be.true;
      expect(await vault.connect(employee).verify(COMMITMENT, 2)).to.be.true;
      expect(await vault.connect(employee).verify(COMMITMENT, 3)).to.be.true;
    });

    it('returns false for wrong proof', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      expect(await vault.connect(employee).verify(BAD_PROOF, 1)).to.be.false;
    });

    it('reverts for proof that is not exactly 32 bytes', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      await expect(
        vault.connect(employee).verify(ethers.toUtf8Bytes('short'), 1)
      ).to.be.revertedWith('proof must be 32 bytes');
    });

    it('reverts for inactive / unenrolled caller', async function () {
      const { vault, stranger } = await loadFixture(enrolledFixture);
      await expect(vault.connect(stranger).verify(COMMITMENT, 1)).to.be.revertedWith(
        'not enrolled'
      );
    });

    it('reverts for scope outside 1-3', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      await expect(vault.connect(employee).verify(COMMITMENT, 0)).to.be.revertedWith(
        'invalid scope'
      );
      await expect(vault.connect(employee).verify(COMMITMENT, 4)).to.be.revertedWith(
        'invalid scope'
      );
    });

    it('returns false after commitment is updated and old proof is used', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      await vault.connect(employee).update(COMMITMENT2);
      expect(await vault.connect(employee).verify(COMMITMENT, 1)).to.be.false;
      expect(await vault.connect(employee).verify(COMMITMENT2, 1)).to.be.true;
    });
  });

  // ── update() ─────────────────────────────────────────────────────────────

  describe('update()', function () {
    it('active employee can update commitment', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      await vault.connect(employee).update(COMMITMENT2);
      expect(await vault.commit(employee.address)).to.equal(COMMITMENT2);
    });

    it('emits CommitmentUpdated event', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      await expect(vault.connect(employee).update(COMMITMENT2))
        .to.emit(vault, 'CommitmentUpdated')
        .withArgs(employee.address);
    });

    it('inactive employee cannot update', async function () {
      const { vault, employer, employee } = await loadFixture(enrolledFixture);
      await vault.connect(employee).deactivate(employee.address);
      await expect(vault.connect(employee).update(COMMITMENT2)).to.be.revertedWith('not active');
    });

    it('rejects zero commitment on update', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      await expect(vault.connect(employee).update(ethers.ZeroHash)).to.be.revertedWith(
        'empty commitment'
      );
    });
  });

  // ── deactivate() ─────────────────────────────────────────────────────────

  describe('deactivate()', function () {
    it('employee can deactivate themselves', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      await vault.connect(employee).deactivate(employee.address);
      expect(await vault.active(employee.address)).to.be.false;
    });

    it('employer can deactivate their employee', async function () {
      const { vault, employer, employee } = await loadFixture(enrolledFixture);
      await vault.connect(employer).deactivate(employee.address);
      expect(await vault.active(employee.address)).to.be.false;
    });

    it('stranger cannot deactivate another employee', async function () {
      const { vault, stranger, employee } = await loadFixture(enrolledFixture);
      await expect(vault.connect(stranger).deactivate(employee.address)).to.be.revertedWith(
        'not authorized'
      );
    });

    it('emits Deactivated event', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      await expect(vault.connect(employee).deactivate(employee.address))
        .to.emit(vault, 'Deactivated')
        .withArgs(employee.address);
    });

    it('verify reverts after deactivation', async function () {
      const { vault, employee } = await loadFixture(enrolledFixture);
      await vault.connect(employee).deactivate(employee.address);
      await expect(vault.connect(employee).verify(COMMITMENT, 1)).to.be.revertedWith(
        'not enrolled'
      );
    });
  });
});
