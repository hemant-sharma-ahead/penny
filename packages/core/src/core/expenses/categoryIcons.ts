/**
 * Curated set of Tabler icons shown by default in the category icon picker, so
 * users pick visually instead of typing a `ti-*` class. Icons are stored on the
 * category as the full `ti-*` class string (matching DEFAULT_EXPENSE_CATEGORIES).
 * The picker also offers a search box over the full Tabler set (see IconGridPicker).
 */
export interface IconGroup {
  label: string;
  icons: string[];
}

export const CATEGORY_ICON_GROUPS: IconGroup[] = [
  {
    label: 'Food & Drink',
    icons: [
      'ti-basket',
      'ti-pizza',
      'ti-coffee',
      'ti-cup',
      'ti-bottle',
      'ti-meat',
      'ti-egg',
      'ti-bread',
      'ti-ice-cream',
      'ti-glass-full'
    ]
  },
  {
    label: 'Transport',
    icons: [
      'ti-car',
      'ti-bus',
      'ti-train',
      'ti-plane',
      'ti-bike',
      'ti-motorbike',
      'ti-gas-station',
      'ti-parking',
      'ti-ship',
      'ti-walk'
    ]
  },
  {
    label: 'Home & Bills',
    icons: [
      'ti-home',
      'ti-building',
      'ti-bulb',
      'ti-bolt',
      'ti-droplet',
      'ti-wifi',
      'ti-flame',
      'ti-trash',
      'ti-tools',
      'ti-receipt'
    ]
  },
  {
    label: 'Health',
    icons: [
      'ti-stethoscope',
      'ti-heartbeat',
      'ti-pill',
      'ti-medical-cross',
      'ti-vaccine',
      'ti-dental',
      'ti-eye',
      'ti-mood-smile',
      'ti-first-aid-kit',
      'ti-run'
    ]
  },
  {
    label: 'Shopping',
    icons: [
      'ti-shopping-bag',
      'ti-shopping-cart',
      'ti-shirt',
      'ti-shoe',
      'ti-gift',
      'ti-tag',
      'ti-hanger',
      'ti-diamond',
      'ti-device-mobile',
      'ti-device-laptop'
    ]
  },
  {
    label: 'Money',
    icons: [
      'ti-wallet',
      'ti-cash',
      'ti-credit-card',
      'ti-coin',
      'ti-pig-money',
      'ti-building-bank',
      'ti-chart-line',
      'ti-businessplan',
      'ti-receipt-tax',
      'ti-percentage'
    ]
  },
  {
    label: 'Entertainment',
    icons: [
      'ti-movie',
      'ti-music',
      'ti-device-tv',
      'ti-device-gamepad-2',
      'ti-ticket',
      'ti-headphones',
      'ti-palette',
      'ti-book',
      'ti-camera',
      'ti-microphone-2'
    ]
  },
  {
    label: 'Travel',
    icons: [
      'ti-luggage',
      'ti-map-pin',
      'ti-beach',
      'ti-mountain',
      'ti-compass',
      'ti-world',
      'ti-bed',
      'ti-building-skyscraper',
      'ti-tent',
      'ti-camera-selfie'
    ]
  },
  {
    label: 'Work & Education',
    icons: [
      'ti-briefcase',
      'ti-school',
      'ti-pencil',
      'ti-book-2',
      'ti-calculator',
      'ti-printer',
      'ti-clipboard',
      'ti-presentation',
      'ti-certificate',
      'ti-backpack'
    ]
  },
  {
    label: 'Misc',
    icons: [
      'ti-dots',
      'ti-star',
      'ti-heart',
      'ti-paw',
      'ti-baby-carriage',
      'ti-leaf',
      'ti-tree',
      'ti-bell',
      'ti-flag',
      'ti-bookmark'
    ]
  }
];

/** Flat list of all curated icon classes (for membership checks). */
export const CATEGORY_ICONS: string[] = CATEGORY_ICON_GROUPS.flatMap((g) => g.icons);

/** Default colour palette shared by the category + parent editors. */
export const CAT_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#6b7280'
];
