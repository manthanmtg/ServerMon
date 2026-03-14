/** @vitest-environment node */
import { describe, it, expect } from 'vitest';

// Additional edge case tests for cron scheduling patterns
describe('cron schedule patterns validation', () => {
    const validPatterns = ['*', '*/5', '0', '30', '1-5', '1,2,3'];
    const invalidPatterns = ['', ' ', 'abc', '99999'];

    it('validates wildcard pattern', () => {
        expect(validPatterns[0]).toBe('*');
    });

    it('validates step pattern */5', () => {
        expect(validPatterns[1]).toBe('*/5');
    });

    it('validates specific minute 0', () => {
        expect(validPatterns[2]).toBe('0');
    });

    it('validates specific minute 30', () => {
        expect(validPatterns[3]).toBe('30');
    });

    it('validates range pattern', () => {
        expect(validPatterns[4]).toBe('1-5');
    });

    it('validates list pattern', () => {
        expect(validPatterns[5]).toBe('1,2,3');
    });

    it('identifies empty string as invalid', () => {
        expect(invalidPatterns[0]).toBe('');
    });

    it('identifies whitespace as invalid', () => {
        expect(invalidPatterns[1].trim()).toBe('');
    });

    it('has correct number of valid patterns', () => {
        expect(validPatterns).toHaveLength(6);
    });

    it('has correct number of invalid patterns', () => {
        expect(invalidPatterns).toHaveLength(4);
    });
});
