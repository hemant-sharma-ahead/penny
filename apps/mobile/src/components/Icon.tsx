import type { ComponentType } from 'react';
import * as TablerIcons from '@tabler/icons-react-native';

/**
 * Resolves the web app's icon convention (Tabler webfont classes, e.g. `ti-alert-triangle`) to the
 * matching `@tabler/icons-react-native` SVG component (`IconAlertTriangle`). This is the single seam
 * every ported component uses instead of `<i className="ti ti-x" />` — callers keep passing the exact
 * same icon-name strings as today (feature code across the app calls these with hundreds of distinct
 * names), so no call site needs to change when its screen is ported in Track 4.
 *
 * Known tradeoff: dynamic name lookup means the whole icon set is bundled (no per-icon tree-shaking) —
 * acceptable for now; revisit only if bundle size becomes a real problem (Track 6 territory).
 */
function toComponentName(tablerClassName: string): string {
  const slug = tablerClassName.replace(/^ti-/, '');
  const pascal = slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `Icon${pascal}`;
}

export interface IconProps {
  /** Same string used today as `ti ${name}` webfont classes, e.g. 'ti-alert-triangle'. */
  name: string;
  size?: number;
  color?: string;
}

type TablerIconComponent = ComponentType<{ size?: number | string; color?: string }>;

export function Icon({ name, size = 16, color }: IconProps) {
  const componentName = toComponentName(name);
  const IconComponent = (TablerIcons as unknown as Record<string, TablerIconComponent>)[componentName];
  // Unmatched names render nothing rather than crash — this repo's no-console rule (see CLAUDE.md)
  // doesn't allow a dev-only warning here without disabling it, and a missing icon is a visible-in-UI
  // problem anyway (an empty spot), so it's self-evident during Track 4's manual per-screen checks.
  if (!IconComponent) return null;
  return <IconComponent size={size} color={color} />;
}
