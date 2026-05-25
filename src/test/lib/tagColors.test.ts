import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAG_COLOR_CLASSES,
  TAG_COLOR_PRESETS,
  getTagColorClasses,
  isTagColorPreset,
} from '@/lib/reader/tagColors';

describe('tagColors', () => {
  it('accepts only known preset keys', () => {
    expect(TAG_COLOR_PRESETS).toContain('blue');
    expect(isTagColorPreset('blue')).toBe(true);
    expect(isTagColorPreset('not-a-color')).toBe(false);
    expect(isTagColorPreset(null)).toBe(false);
  });

  it('returns neutral classes for missing or unknown colors', () => {
    expect(getTagColorClasses(null)).toBe(DEFAULT_TAG_COLOR_CLASSES);
    expect(getTagColorClasses('not-a-color')).toBe(DEFAULT_TAG_COLOR_CLASSES);
  });

  it('returns stable classes for preset colors', () => {
    const classes = getTagColorClasses('blue');

    expect(classes.badge).toContain('border-blue');
    expect(classes.dot).toContain('bg-blue');
    expect(classes.text).toContain('text-blue');
  });
});
