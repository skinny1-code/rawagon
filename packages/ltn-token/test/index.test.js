const ltn = require('../index');

describe('ltn-token', () => {
  it('exports a module without throwing', () => {
    expect(ltn).toBeDefined();
  });
  it('is an object (stub, not yet implemented)', () => {
    expect(typeof ltn).toBe('object');
  });
});
