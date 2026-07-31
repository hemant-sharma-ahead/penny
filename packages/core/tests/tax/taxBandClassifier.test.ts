import { describe, expect, it } from 'vitest';
import { classifyTaxBand } from '@/core/tax/taxBandClassifier';
import type { ExpenseCategory } from '@/core/db/types';

const cat = (id: string, intentGroup: string): ExpenseCategory => ({
  id,
  name: id,
  icon: '',
  color: '',
  isDefault: true,
  intentGroup,
  applicableTo: 'expense',
  createdAt: 0
});

describe('classifyTaxBand', () => {
  it('detects fuel hidden inside Transport via the description', () => {
    expect(classifyTaxBand({ categoryId: 'cat-transport', description: 'Petrol — Indian Oil' })).toBe('fuel');
    expect(classifyTaxBand({ categoryId: 'cat-transport', description: 'Diesel fill' })).toBe('fuel');
  });

  it('treats a plain cab ride under Transport as GST 5%', () => {
    expect(classifyTaxBand({ categoryId: 'cat-transport', description: 'Uber to office' })).toBe('gst-5');
  });

  it('detects toll and prefers it over vehicle/fuel cues', () => {
    expect(classifyTaxBand({ categoryId: 'cat-transport', description: 'FASTag toll plaza' })).toBe('toll');
  });

  it('detects a vehicle purchase / road tax anywhere', () => {
    expect(classifyTaxBand({ categoryId: 'cat-other', description: 'Car road tax + RTO' })).toBe('vehicle');
  });

  it('uses the category map when no keyword matches', () => {
    expect(classifyTaxBand({ categoryId: 'cat-rent', description: 'June rent' })).toBe('exempt');
    expect(classifyTaxBand({ categoryId: 'cat-alcohol', description: 'beer' })).toBe('alcohol');
  });

  it('falls back to the intent group for unmapped custom categories', () => {
    expect(
      classifyTaxBand({ categoryId: 'cat-custom-xyz', description: 'thing' }, cat('cat-custom-xyz', 'lifestyle'))
    ).toBe('gst-18');
  });

  it('falls back to the default band when nothing matches', () => {
    expect(classifyTaxBand({ categoryId: 'cat-custom-xyz', description: 'thing' })).toBe('gst-18');
  });
});
