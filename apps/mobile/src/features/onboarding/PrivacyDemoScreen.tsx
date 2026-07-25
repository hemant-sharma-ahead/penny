import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput as RNTextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { encrypt, deriveKey, generateSalt } from '@/core/crypto/engine';
import { Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { OnboardingStackParamList } from '~/navigation/OnboardingNavigator';
import { OnboardingBack } from './OnboardingBack';

const DEMO_SALT = generateSalt();
const DEFAULT_TEXT = 'My salary is ₹80,000 per month';

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function encryptText(text: string): Promise<string> {
  const key = await deriveKey('demo-key', DEMO_SALT, 1_000);
  const { iv, ciphertext: ct } = await encrypt(key, new TextEncoder().encode(text));
  return `${bufferToBase64(iv)}.${bufferToBase64(ct)}`;
}

export function PrivacyDemoScreen() {
  const [input, setInput] = useState(DEFAULT_TEXT);
  const [ciphertext, setCiphertext] = useState('');
  const [encrypting, setEncrypting] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const theme = useThemeColors();
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    encryptText(DEFAULT_TEXT)
      .then((ct) => {
        if (!cancelRef.current) setCiphertext(ct);
      })
      .catch(() => {
        if (!cancelRef.current) setCiphertext('');
      });
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const handleChange = async (value: string) => {
    setInput(value);
    if (!value.trim()) {
      setCiphertext('');
      return;
    }
    setEncrypting(true);
    try {
      const ct = await encryptText(value);
      setCiphertext(ct);
    } catch {
      setCiphertext('');
    } finally {
      setEncrypting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <OnboardingBack to="PrivacyPromise" />
      <ScrollView className="flex-1 px-6 py-10" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 w-full">
          <View className="mb-8 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: theme.primary }}
            >
              <Icon name="ti-eye-off" size={28} color="#fff" />
            </View>
            <Text className="text-2xl font-semibold text-primary mb-2 text-center">See encryption in action</Text>
            <Text className="text-sm text-secondary text-center">
              Type anything — watch it become unreadable ciphertext instantly.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-xs font-medium text-tertiary mb-1.5 uppercase tracking-wide">Your text</Text>
            <RNTextInput
              value={input}
              onChangeText={(v) => void handleChange(v)}
              multiline
              numberOfLines={3}
              placeholder="Type something sensitive…"
              placeholderTextColor={theme.textTertiary}
              className="bg-surface-2 text-primary border w-full rounded-xl px-4 py-3 text-sm"
              style={{ borderColor: theme.border, textAlignVertical: 'top' }}
            />
          </View>

          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-xs font-medium text-tertiary uppercase tracking-wide">What Penny stores</Text>
              {encrypting && <Text className="text-tertiary text-xs">Encrypting…</Text>}
            </View>
            <View className="w-full min-h-[80px] bg-slate-900 rounded-xl px-4 py-3">
              <Text className="font-mono text-xs text-emerald-400 leading-relaxed">
                {ciphertext || (input ? '...' : 'Start typing above to see live encryption')}
              </Text>
            </View>
          </View>

          <View className="rounded-xl bg-surface-2 px-4 py-3 mb-8">
            <Text className="text-xs text-secondary leading-relaxed">
              Every record is encrypted with a random key that never leaves your device — and that key is itself locked
              by your passphrase. Even if someone extracted your device storage, this is all they would see.
            </Text>
          </View>

          <Button variant="primary" size="lg" fullWidth onPress={() => navigation.navigate('ChipIntro')}>
            Got it — meet Chip
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
