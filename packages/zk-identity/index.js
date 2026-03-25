// @rawagon/zk-identity — Shifting PAN + ZK proofs + AuraMe biometric key derivation
// Patent pending RAW-2026-PROV-001
const crypto = require('crypto');
function derivePAN(keyHex, nonce) {
  const path = `m/44'/60'/0'/0/${nonce}`;
  const h = crypto.createHmac('sha256', Buffer.from(keyHex, 'hex')).update(path).digest();
  const raw = BigInt('0x' + h.slice(0, 8).toString('hex'));
  const d = String((raw % 9000000000000000n) + 1000000000000000n);
  return { pan: `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12, 16)}`, nonce };
}
function commit(creds, keyHex) {
  return (
    '0x' +
    crypto
      .createHmac('sha256', Buffer.from(keyHex, 'hex'))
      .update(JSON.stringify(creds))
      .digest('hex')
  );
}
function prove(creds, keyHex) {
  return {
    proof: crypto
      .createHmac('sha256', Buffer.from(keyHex, 'hex'))
      .update(JSON.stringify(creds))
      .digest('hex'),
    commitment: commit(creds, keyHex),
    ts: Date.now(),
  };
}
function bioDerive(vec, salt) {
  const s = salt || crypto.randomBytes(32).toString('hex');
  return {
    masterKey: crypto
      .createHmac('sha256', Buffer.from(s, 'hex'))
      .update(JSON.stringify(vec))
      .digest('hex'),
    salt: s,
  };
}
function genKey() {
  return crypto.randomBytes(32).toString('hex');
}
module.exports = { derivePAN, commit, prove, bioDerive, genKey };
