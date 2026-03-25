const { derivePAN, prove, genKey } = require('@rawagon/zk-identity');
class AllCard {
  constructor(k) {
    this.key = k || genKey();
    this.n = 0;
  }
  shift() {
    return derivePAN(this.key, ++this.n);
  }
  prove(c) {
    return prove(c, this.key);
  }
  static create() {
    return new AllCard(genKey());
  }
}
module.exports = { AllCard };
