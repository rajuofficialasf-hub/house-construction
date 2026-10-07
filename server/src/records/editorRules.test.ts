import { describe, expect, it } from 'vitest';
import { emptiedField } from './editorRules.js';

const BEFORE = { name: 'রহিমা', address: 'গ্রাম', union_name: '', current_photo_source: 'ফোন', extra: { tribe: 'ক', size: 10, note: '' } };

describe('emptiedField', () => {
  it.each([
    ['a text column sent as ""', { address: '' }, 'address'],
    ['a text column sent as spaces', { address: '   ' }, 'address'],
    ['a nullable column sent as null', { current_photo_source: null }, 'current_photo_source'],
    ['an extra key dropped', { extra: { size: 10 } }, 'extra.tribe'],
    ['an extra key set to null', { extra: { tribe: null, size: 10 } }, 'extra.tribe'],
    ['an extra key set to ""', { extra: { tribe: '', size: 10 } }, 'extra.tribe'],
    ['an extra key set to spaces', { extra: { tribe: '  ', size: 10 } }, 'extra.tribe'],
    ['a number dropped from extra', { extra: { tribe: 'ক' } }, 'extra.size'],
  ])('finds %s', (_label, patch, field) => {
    expect(emptiedField(BEFORE, patch)).toBe(field);
  });

  it.each([
    ['an empty value filled', { union_name: 'নতুন', extra: { tribe: 'ক', size: 10, note: 'লেখা' } }],
    ['a value changed', { name: 'অন্য', extra: { tribe: 'খ', size: 0 } }],
    ['an empty value sent empty again', { union_name: '', extra: { tribe: 'ক', size: 10 } }],
    ['an unsent column', { name: 'অন্য' }],
    ['an extra not sent at all', { address: 'নতুন' }],
  ])('allows %s', (_label, patch) => {
    expect(emptiedField(BEFORE, patch)).toBeUndefined();
  });

  it('names the first emptied key, columns before extra', () => {
    expect(emptiedField(BEFORE, { extra: {}, name: '' })).toBe('name');
  });

  it('treats a missing before value as empty', () => {
    expect(emptiedField({ extra: {} }, { address: '', extra: {} })).toBeUndefined();
  });
});
