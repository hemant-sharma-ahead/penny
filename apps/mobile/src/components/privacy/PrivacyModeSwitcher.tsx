import { View, Pressable } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { usePrivacy, type PrivacyMode } from '~/context/PrivacyContext';
import { tint } from '~/lib/color';
import { useOpenModeGate } from './useOpenModeGate';

/**
 * RN port of apps/web-react/src/components/privacy/PrivacyModeSwitcher.tsx — a header icon button that
 * toggles Safe/Open, PIN-gated on the Safe→Open direction.
 *
 * 2026-08-18: Private mode and Open mode's fixed-duration countdown badge were both removed (real-
 * device testing found the three-mode picker + timer overkill) — this is now a plain Safe/Open toggle.
 *
 * 2026-08-20: with only two modes left, a dropdown to pick "the other one" is a needless extra tap —
 * tapping the header icon now directly toggles Safe↔Open (still gated by the same PIN + warning step
 * on the Safe→Open direction; Open→Safe reverts immediately, unchanged, since reverting to the safer
 * mode has never needed a PIN).
 *
 * 2026-08-29 (punch-list item 12): the PIN + warning modal steps moved out into `useOpenModeGate.tsx`
 * (this component lives inside `MainNavigator`'s native-stack header, which — like every RN native
 * header — commonly clips overflowing absolutely-positioned children entirely, which is why those steps
 * render on the shared `Modal` component rather than a custom overlay in the first place; see that
 * hook's own doc comment) — `SettingsPage.tsx`'s new "Default to Open mode" row is a second caller that
 * needs the exact same gate, not a parallel one.
 */
export function PrivacyModeSwitcher() {
  const { mode, setMode } = usePrivacy();
  const { requestOpen, modal } = useOpenModeGate();

  const theme = useThemeColors();
  const MODE: Record<PrivacyMode, { label: string; icon: string; color: string }> = {
    safe: { label: 'Safe', icon: 'ti-eye-off', color: theme.warning },
    open: { label: 'Open', icon: 'ti-eye', color: theme.open }
  };
  const active = MODE[mode];

  const handleToggle = () => {
    if (mode === 'open') {
      setMode('safe');
      return;
    }
    requestOpen();
  };

  return (
    <>
      <View className="relative">
        <Pressable
          onPress={handleToggle}
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: tint(active.color, 14) }}
          accessibilityLabel={`Privacy mode: ${active.label}. Tap to switch to ${MODE[mode === 'open' ? 'safe' : 'open'].label}.`}
        >
          <Icon name={active.icon} size={17} color={active.color} />
        </Pressable>
      </View>

      {modal}
    </>
  );
}
