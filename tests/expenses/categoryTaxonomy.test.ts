import { describe, expect, it } from 'vitest';
import {
  ALL_DEFAULT_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  INTENT_GROUP_META,
  isRoutineGroup
} from '@/core/db/defaultCategories';
import { CATEGORY_BAND, INTENT_GROUP_BAND } from '@/core/tax/categoryTaxMap';

const expenseIds = DEFAULT_EXPENSE_CATEGORIES.map((c) => c.id);
const incomeIds = DEFAULT_INCOME_CATEGORIES.map((c) => c.id);

// The Balanced split (approved): daily-routine vs set-aside. Set-aside is summarised separately so a
// trip / family support / lawsuit / lending never distorts the everyday spending picture.
const ROUTINE = ['daily_living', 'home_utilities', 'health', 'education', 'lifestyle', 'sin_goods'];
const SET_ASIDE = ['financial', 'travel', 'family_giving', 'legal', 'other'];

describe('routine / set-aside classification (Balanced)', () => {
  it('marks the routine intent groups as daily-routine', () => {
    for (const g of ROUTINE) expect(isRoutineGroup(g)).toBe(true);
  });

  it('marks the set-aside intent groups as non-routine', () => {
    for (const g of SET_ASIDE) expect(isRoutineGroup(g)).toBe(false);
  });

  it('treats an unknown group (e.g. a user-created parent) as daily-routine by default', () => {
    expect(isRoutineGroup('custom-parent-uuid')).toBe(true);
  });

  it('keeps the meta flags in sync with the classification', () => {
    for (const g of ROUTINE) expect(INTENT_GROUP_META[g]?.routine).not.toBe(false);
    for (const g of SET_ASIDE) expect(INTENT_GROUP_META[g]?.routine).toBe(false);
  });
});

describe('Legal intent group', () => {
  const legalCats = DEFAULT_EXPENSE_CATEGORIES.filter((c) => c.intentGroup === 'legal');

  it('exists in the intent-group meta and is set-aside', () => {
    expect(INTENT_GROUP_META.legal?.label).toBe('Legal');
    expect(isRoutineGroup('legal')).toBe(false);
  });

  it('ships the expected legal categories', () => {
    const ids = legalCats.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'cat-legal-advocate',
        'cat-legal-court',
        'cat-legal-stamp',
        'cat-legal-notary',
        'cat-legal-filing',
        'cat-legal-affidavit',
        'cat-legal-typing',
        'cat-legal-exemption',
        'cat-legal-transport',
        'cat-legal-food',
        'cat-legal-misc'
      ])
    );
  });

  it('wires every legal category into the tax-footprint band map', () => {
    for (const c of legalCats) expect(CATEGORY_BAND[c.id]).toBeDefined();
    expect(INTENT_GROUP_BAND.legal).toBeDefined();
  });

  it('treats advocate/court/government fees as GST-exempt and ancillary spend as taxable', () => {
    expect(CATEGORY_BAND['cat-legal-advocate']).toBe('exempt');
    expect(CATEGORY_BAND['cat-legal-court']).toBe('exempt');
    expect(CATEGORY_BAND['cat-legal-stamp']).toBe('exempt');
    expect(CATEGORY_BAND['cat-legal-typing']).toBe('gst-18');
    expect(CATEGORY_BAND['cat-legal-transport']).toBe('gst-5');
  });
});

describe('Travel & Education additions', () => {
  it('ships the new Travel categories with tax bands', () => {
    const travel = DEFAULT_EXPENSE_CATEGORIES.filter((c) => c.intentGroup === 'travel').map((c) => c.id);
    expect(travel).toEqual(
      expect.arrayContaining(['cat-trip-prep', 'cat-trip-shopping', 'cat-trip-fuel', 'cat-vehicle-service'])
    );
    expect(CATEGORY_BAND['cat-trip-fuel']).toBe('fuel');
    expect(CATEGORY_BAND['cat-trip-shopping']).toBe('gst-18');
    expect(CATEGORY_BAND['cat-vehicle-service']).toBe('gst-18');
  });

  it('ships the new Education categories', () => {
    const edu = DEFAULT_EXPENSE_CATEGORIES.filter((c) => c.intentGroup === 'education').map((c) => c.id);
    expect(edu).toEqual(expect.arrayContaining(['cat-edu-transport', 'cat-edu-trip', 'cat-edu-competition']));
  });
});

describe('category icons render in the webfont', () => {
  // ti-fork and ti-piggy-bank exist in the SVG index but NOT the shipped webfont — they render blank.
  // Guard against any default category using an icon known to be absent from the webfont.
  const MISSING_FROM_WEBFONT = new Set(['ti-fork', 'ti-piggy-bank']);

  it('no default category uses a webfont-missing icon', () => {
    const offenders = ALL_DEFAULT_CATEGORIES.filter((c) => MISSING_FROM_WEBFONT.has(c.icon)).map((c) => c.id);
    expect(offenders).toEqual([]);
  });

  it('the previously-blank icons are fixed', () => {
    expect(DEFAULT_EXPENSE_CATEGORIES.find((c) => c.id === 'cat-trip-food')?.icon).toBe('ti-tools-kitchen-2');
    expect(DEFAULT_EXPENSE_CATEGORIES.find((c) => c.id === 'cat-savings')?.icon).toBe('ti-pig-money');
  });
});

describe('Daily Living / Home / Renovation additions', () => {
  it('adds Fuel + Salon to Daily Living, keeps a separate Trip Fuel in Travel', () => {
    expect(expenseIds).toEqual(expect.arrayContaining(['cat-fuel', 'cat-salon']));
    const fuel = DEFAULT_EXPENSE_CATEGORIES.find((c) => c.id === 'cat-fuel');
    expect(fuel?.intentGroup).toBe('daily_living');
    const tripFuel = DEFAULT_EXPENSE_CATEGORIES.find((c) => c.id === 'cat-trip-fuel');
    expect(tripFuel?.intentGroup).toBe('travel');
    expect(expenseIds).not.toContain('cat-fuel-daily'); // no accidental duplicate
    expect(CATEGORY_BAND['cat-fuel']).toBe('fuel');
    expect(CATEGORY_BAND['cat-trip-fuel']).toBe('fuel');
    expect(CATEGORY_BAND['cat-salon']).toBe('gst-18');
  });

  it('adds Home Services under Home & Utilities', () => {
    expect(DEFAULT_EXPENSE_CATEGORIES.find((c) => c.id === 'cat-home-services')?.intentGroup).toBe('home_utilities');
    expect(CATEGORY_BAND['cat-home-services']).toBe('gst-18');
  });

  it('adds a set-aside Renovation intent group with categories', () => {
    expect(INTENT_GROUP_META.renovation?.label).toBe('Renovation');
    expect(isRoutineGroup('renovation')).toBe(false);
    expect(INTENT_GROUP_BAND.renovation).toBeDefined();
    const reno = DEFAULT_EXPENSE_CATEGORIES.filter((c) => c.intentGroup === 'renovation').map((c) => c.id);
    expect(reno).toEqual(
      expect.arrayContaining([
        'cat-reno-materials',
        'cat-reno-labour',
        'cat-reno-furniture',
        'cat-reno-fixtures',
        'cat-reno-painting',
        'cat-reno-interior',
        'cat-reno-appliances',
        'cat-reno-other'
      ])
    );
  });
});

describe('Income category changes', () => {
  it('splits Dividends & Interest and adds Capital Gains, Bonus, Reimbursements', () => {
    expect(incomeIds).toEqual(
      expect.arrayContaining([
        'cat-inc-interest',
        'cat-inc-capital-gains',
        'cat-inc-bonus',
        'cat-inc-reimbursement'
      ])
    );
    expect(DEFAULT_INCOME_CATEGORIES.find((c) => c.id === 'cat-inc-dividends')?.name).toBe('Dividends');
  });
});
