import { getNestedValue } from '../src/get-nested-value';

describe('getNestedValue', () => {
  const config = {
    platform: {
      projectId: 'my-project',
      projectNumber: '123456',
      region: 'europe-west2',
    },
    ingressDomains: [{ domain: 'dev.example.com' }],
    internalServices: { domain: 'internal.dev.example.com' },
  };

  it('resolves simple dot paths', () => {
    expect(getNestedValue(config, 'platform.projectId')).toBe('my-project');
    expect(getNestedValue(config, 'platform.region')).toBe('europe-west2');
  });

  it('resolves array bracket notation', () => {
    expect(getNestedValue(config, 'ingressDomains[0].domain')).toBe(
      'dev.example.com'
    );
  });

  it('resolves nested object paths', () => {
    expect(getNestedValue(config, 'internalServices.domain')).toBe(
      'internal.dev.example.com'
    );
  });

  it('returns undefined for missing paths', () => {
    expect(getNestedValue(config, 'platform.nonexistent')).toBeUndefined();
    expect(getNestedValue(config, 'missing.deeply.nested')).toBeUndefined();
  });

  it('returns undefined for null/undefined input', () => {
    expect(getNestedValue(null, 'any.path')).toBeUndefined();
    expect(getNestedValue(undefined, 'any.path')).toBeUndefined();
  });

  it('returns undefined for out-of-bounds array index', () => {
    expect(getNestedValue(config, 'ingressDomains[5].domain')).toBeUndefined();
  });
});
