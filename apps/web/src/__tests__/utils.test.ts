import { describe, it, expect } from 'vitest';
import { getInitials } from '../lib/utils';

describe('getInitials', () => {
  it('returns first two chars for single name', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('returns first letters of each word', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns first letter for single char name', () => {
    expect(getInitials('A')).toBe('A');
  });

  it('returns first two letters for multiple words', () => {
    expect(getInitials('John Michael Doe')).toBe('JM');
  });

  it('handles all uppercase', () => {
    expect(getInitials('HELLO WORLD')).toBe('HW');
  });
});
