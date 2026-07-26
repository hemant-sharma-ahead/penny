import { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from '../Icon';
import { ConfirmDialog } from '../ui';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '~/context/ToastContext';
import { wipeDemoData } from '@/core/db/seedDemoData';

/**
 * Persistent strip shown for as long as the vault is a throwaway Demo Mode one (profile.demoSeeded).
 * RN port of web's `components/demo/DemoModeBanner.tsx` — same exit flow as `SettingsPage`'s Danger
 * zone entry (`wipeDemoData()` then hand off to the real account-start flow), just also reachable from
 * every screen instead of only Settings.
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
      <View className="flex-row items-center gap-2 px-4 py-2 bg-violet-600">
        <Icon name="ti-flask" size={12} color="#ffffff" />
        <View className="flex-1">
          <Text className="text-[10px] font-bold leading-tight text-white">Demo Mode</Text>
          <Text className="text-[9px] leading-tight text-white opacity-85">Exploring with sample data</Text>
        </View>
        <Pressable onPress={() => setConfirming(true)} className="rounded-lg px-2.5 py-1.5 bg-white/20" hitSlop={4}>
          <Text className="text-[9px] font-bold text-white">Exit Demo Mode</Text>
        </Pressable>
      </View>

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
