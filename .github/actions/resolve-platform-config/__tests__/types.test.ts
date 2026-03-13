import { ConfigError } from '../src/types';

describe('ConfigError', () => {
  it('has name ConfigError', () => {
    const err = new ConfigError('test message');
    expect(err.name).toBe('ConfigError');
  });

  it('extends Error', () => {
    const err = new ConfigError('test message');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test message');
  });
});
