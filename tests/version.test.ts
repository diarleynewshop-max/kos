import { describe, expect, it } from 'vitest';
import { isNewer, parseVersion } from '../src/services/version';

describe('parseVersion', () => {
  it('strips the tag prefix used by GitHub releases', () => {
    expect(parseVersion('v1.4.1')).toEqual([1, 4, 1]);
    expect(parseVersion('1.4.1')).toEqual([1, 4, 1]);
  });

  it('treats unparsable segments as zero instead of NaN', () => {
    expect(parseVersion('1.x.3')).toEqual([1, 0, 3]);
  });
});

describe('isNewer', () => {
  it('detects a newer release', () => {
    expect(isNewer('v1.4.2', '1.4.1')).toBe(true);
    expect(isNewer('v1.5.0', '1.4.9')).toBe(true);
    expect(isNewer('v2.0.0', '1.9.9')).toBe(true);
  });

  it('does not offer an update for the installed or an older version', () => {
    expect(isNewer('v1.4.1', '1.4.1')).toBe(false);
    expect(isNewer('v1.4.0', '1.4.1')).toBe(false);
    expect(isNewer('v1.3.9', '1.4.0')).toBe(false);
  });

  it('compares numerically, not as text', () => {
    // The bug this guards against: "1.10.0" < "1.9.0" under string comparison,
    // which would silently stop offering updates after version 1.9.
    expect(isNewer('v1.10.0', '1.9.0')).toBe(true);
    expect(isNewer('v1.9.0', '1.10.0')).toBe(false);
  });

  it('handles versions with differing segment counts', () => {
    expect(isNewer('v1.5', '1.4.9')).toBe(true);
    expect(isNewer('v1.4', '1.4.0')).toBe(false);
    expect(isNewer('v1.4.0.1', '1.4.0')).toBe(true);
  });
});
