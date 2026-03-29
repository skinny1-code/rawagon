'use strict';
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('IQTitle', function () {
  const VIN = '1HGCM82633A123456'; // valid 17-char VIN
  const VIN2 = '2HGCM82633A654321';
  const MAKE = 'Honda';
  const MODEL = 'Accord';
  const YEAR = 2003;
  const RECALLS = 0;
  const SALVAGE = false;
  const URI = 'ipfs://QmTest';
  const MINT_FEE = ethers.parseEther('0.001');

  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const IQTitle = await ethers.getContractFactory('IQTitle');
    const iq = await IQTitle.deploy(owner.address);
    return { iq, owner, alice, bob };
  }

  async function mintFixture() {
    const base = await deployFixture();
    const { iq, alice } = base;
    await iq.connect(alice).mint(VIN, MAKE, MODEL, YEAR, RECALLS, SALVAGE, URI, {
      value: MINT_FEE,
    });
    const tokenId = await iq.vinToId(VIN);
    return { ...base, tokenId };
  }

  // ── Deployment ────────────────────────────────────────────────────────────

  describe('deployment', function () {
    it('has correct name and symbol', async function () {
      const { iq } = await loadFixture(deployFixture);
      expect(await iq.name()).to.equal('IQTitle');
      expect(await iq.symbol()).to.equal('IQCAR');
    });

    it('sets initial mint fee to 0.001 ETH', async function () {
      const { iq } = await loadFixture(deployFixture);
      expect(await iq.fee()).to.equal(MINT_FEE);
    });

    it('sets owner correctly', async function () {
      const { iq, owner } = await loadFixture(deployFixture);
      expect(await iq.owner()).to.equal(owner.address);
    });
  });

  // ── vinToId() ─────────────────────────────────────────────────────────────

  describe('vinToId()', function () {
    it('returns keccak256 of VIN bytes', async function () {
      const { iq } = await loadFixture(deployFixture);
      const expected = BigInt(ethers.keccak256(ethers.toUtf8Bytes(VIN)));
      expect(await iq.vinToId(VIN)).to.equal(expected);
    });

    it('is deterministic — same VIN always same id', async function () {
      const { iq } = await loadFixture(deployFixture);
      expect(await iq.vinToId(VIN)).to.equal(await iq.vinToId(VIN));
    });

    it('different VINs produce different ids', async function () {
      const { iq } = await loadFixture(deployFixture);
      expect(await iq.vinToId(VIN)).to.not.equal(await iq.vinToId(VIN2));
    });
  });

  // ── mint() ────────────────────────────────────────────────────────────────

  describe('mint()', function () {
    it('mints NFT to caller with correct tokenId', async function () {
      const { iq, alice, tokenId } = await loadFixture(mintFixture);
      expect(await iq.ownerOf(tokenId)).to.equal(alice.address);
    });

    it('stores all vehicle metadata', async function () {
      const { iq, tokenId } = await loadFixture(mintFixture);
      const meta = await iq.v(tokenId);
      expect(meta.vin).to.equal(VIN);
      expect(meta.make).to.equal(MAKE);
      expect(meta.model).to.equal(MODEL);
      expect(meta.year).to.equal(YEAR);
      expect(meta.recalls).to.equal(RECALLS);
      expect(meta.salvage).to.equal(SALVAGE);
      expect(meta.ts).to.be.gt(0n);
    });

    it('marks VIN as registered', async function () {
      const { iq } = await loadFixture(mintFixture);
      expect(await iq.reg(VIN)).to.be.true;
    });

    it('emits Minted event', async function () {
      const { iq, alice } = await loadFixture(deployFixture);
      const expectedId = await iq.vinToId(VIN);
      await expect(
        iq.connect(alice).mint(VIN, MAKE, MODEL, YEAR, RECALLS, SALVAGE, URI, { value: MINT_FEE })
      )
        .to.emit(iq, 'Minted')
        .withArgs(expectedId, VIN, alice.address);
    });

    it('reverts when fee is insufficient', async function () {
      const { iq, alice } = await loadFixture(deployFixture);
      await expect(
        iq
          .connect(alice)
          .mint(VIN, MAKE, MODEL, YEAR, RECALLS, SALVAGE, URI, { value: MINT_FEE - 1n })
      ).to.be.reverted;
    });

    it('reverts when VIN is not exactly 17 characters', async function () {
      const { iq, alice } = await loadFixture(deployFixture);
      await expect(
        iq
          .connect(alice)
          .mint('SHORT', MAKE, MODEL, YEAR, RECALLS, SALVAGE, URI, { value: MINT_FEE })
      ).to.be.reverted;
    });

    it('reverts on duplicate VIN', async function () {
      const { iq, bob } = await loadFixture(mintFixture);
      await expect(
        iq.connect(bob).mint(VIN, MAKE, MODEL, YEAR, RECALLS, SALVAGE, URI, { value: MINT_FEE })
      ).to.be.reverted;
    });

    it('accepts overpayment of fee', async function () {
      const { iq, alice } = await loadFixture(deployFixture);
      await expect(
        iq
          .connect(alice)
          .mint(VIN, MAKE, MODEL, YEAR, RECALLS, SALVAGE, URI, { value: MINT_FEE * 2n })
      ).to.not.be.reverted;
    });
  });

  // ── tokenURI() ────────────────────────────────────────────────────────────

  describe('tokenURI()', function () {
    it('returns the URI set at mint time', async function () {
      const { iq, tokenId } = await loadFixture(mintFixture);
      expect(await iq.tokenURI(tokenId)).to.equal(URI);
    });
  });

  // ── setFee() ──────────────────────────────────────────────────────────────

  describe('setFee()', function () {
    it('owner can update the mint fee', async function () {
      const { iq, owner } = await loadFixture(deployFixture);
      const newFee = ethers.parseEther('0.01');
      await iq.connect(owner).setFee(newFee);
      expect(await iq.fee()).to.equal(newFee);
    });

    it('non-owner cannot set fee', async function () {
      const { iq, alice } = await loadFixture(deployFixture);
      await expect(iq.connect(alice).setFee(0n)).to.be.reverted;
    });

    it('new fee is enforced on next mint', async function () {
      const { iq, owner, alice } = await loadFixture(deployFixture);
      const newFee = ethers.parseEther('0.01');
      await iq.connect(owner).setFee(newFee);
      // old fee should now fail
      await expect(
        iq.connect(alice).mint(VIN, MAKE, MODEL, YEAR, RECALLS, SALVAGE, URI, { value: MINT_FEE })
      ).to.be.reverted;
      // new fee should succeed
      await expect(
        iq.connect(alice).mint(VIN, MAKE, MODEL, YEAR, RECALLS, SALVAGE, URI, { value: newFee })
      ).to.not.be.reverted;
    });
  });

  // ── withdraw() ────────────────────────────────────────────────────────────

  describe('withdraw()', function () {
    it('owner can withdraw accumulated ETH', async function () {
      const { iq, owner } = await loadFixture(mintFixture);
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const tx = await iq.connect(owner).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const ownerAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerAfter - ownerBefore + gasUsed).to.equal(MINT_FEE);
    });

    it('contract balance is zero after withdrawal', async function () {
      const { iq, owner } = await loadFixture(mintFixture);
      await iq.connect(owner).withdraw();
      expect(await ethers.provider.getBalance(await iq.getAddress())).to.equal(0n);
    });

    it('non-owner cannot withdraw', async function () {
      const { iq, alice } = await loadFixture(mintFixture);
      await expect(iq.connect(alice).withdraw()).to.be.reverted;
    });
  });
});
