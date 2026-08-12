import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../Icon';
import { ConfirmDialog } from '../ui';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '~/context/ToastContext';
import { wipeDemoData } from '@/core/db/seedDemoData';

/**
 * Slim strip shown for as long as the vault is a throwaway Demo Mode one (profile.demoSeeded).
 * Rendered by `MainTabs.tsx` directly below the persistent header row, inside that same
 * safe-area-padded block (not as a separate sibling above it) — a single-line strip, not the
 * original two-line version with a subtitle, since it now shares vertical space with a header
 * row that already accounts for the notch/status-bar inset once. Two independent top-inset
 * calculations (this banner's old flush-to-the-top layout + the header's own `insets.top`) is
 * what produced a dead gap between them on real devices — see
 * docs/mockups/proposals/demo-mode-banner-v1.html for the before/after. Hidden while on the
 * Settings screen, which has its own relocated Exit Demo Mode entry point instead (right below
 * the profile) — no need for two exits on screen at once.
 */
export function DemoModeBanner() {
  const { profile } = useProfile();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [exiting, setExiting] = useState(false);

  if (!profile?.demoSeeded) return null;

  const handleExit = async () => {
    setExiting(true);
    try {
      await wipeDemoData();
      navigation.navigate('OnboardingFlow', { screen: 'Start', params: { fromDemoMode: true } });
    } catch {
      showToast({ message: "Couldn't exit Demo Mode. Please try again." });
    } finally {
      setExiting(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <LinearGradient
        colors={['#7c3aed', '#9333ea']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}
      >
        <Icon name="ti-flask" size={11} color="#ffffff" />
        <Text className="flex-1 text-[11px] font-bold text-white">Demo Mode</Text>
        <Pressable onPress={() => setConfirming(true)} className="rounded-lg px-2 py-1 bg-white/20" hitSlop={4}>
          <Text className="text-[10px] font-bold text-white">Exit</Text>
        </Pressable>
      </LinearGradient>

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void handleExit()}
        title="Ready to make it yours?"
        message="We'll clear this sample data and walk you through setting up your real account — your accounts, a few personal details, and your own PIN and passphrase."
        confirmLabel="Continue"
        cancelLabel="Not yet"
        confirmVariant="primary"
        loading={exiting}
      />
    </>
  );
}
