import { useState } from 'react';
import { View, Pressable, ScrollView, Linking, TextInput as RNTextInput, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { PageHeader } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { tint } from '~/lib/color';

// Placeholder — swap for real support inbox before release
const SUPPORT_EMAIL = 'feedback@penny.app';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

type FeedbackType = 'bug' | 'suggestion' | 'question';

const TYPES: { id: FeedbackType; label: string; icon: string; subject: string }[] = [
  { id: 'bug', label: 'Bug report', icon: 'ti-bug', subject: 'Bug report — Penny' },
  { id: 'suggestion', label: 'Suggestion', icon: 'ti-bulb', subject: 'Suggestion — Penny' },
  { id: 'question', label: 'Question', icon: 'ti-help-circle', subject: 'Question — Penny' }
];

const INFO_ROWS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'ti-lock',
    title: 'Privacy-first',
    body: 'Only what you type is sent — no financial data, device fingerprint, or identifiers are ever attached automatically.'
  },
  { icon: 'ti-mail', title: 'Sending to', body: SUPPORT_EMAIL },
  { icon: 'ti-device-mobile', title: 'App version', body: `Penny v${APP_VERSION}` }
];

/**
 * RN port of apps/web-legacy/src/features/feedback/FeedbackPage.tsx — a `mailto:` draft composer, no
 * network call. Web's `window.open(mailto)` becomes RN's `Linking.openURL`. `__APP_VERSION__` (a Vite
 * define reading package.json) has no mobile equivalent yet, so this reads `app.json`'s `version` via
 * `expo-constants` instead — first use of that field on mobile (Constants.expoConfig is already used
 * for `extra.*` by packages/core's entitlement/apiBase native adapters).
 */
export function FeedbackPage() {
  const modeBg = useModeBackgroundColor();
  const theme = useThemeColors();
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [message, setMessage] = useState('');

  const selected = TYPES.find((t) => t.id === type) ?? TYPES[0];

  function handleSend() {
    const trimmed = message.trim();
    const bodyParts = trimmed ? [trimmed, '', '---', `Penny v${APP_VERSION}`] : ['---', `Penny v${APP_VERSION}`];
    const body = bodyParts.join('\n');
    const mailto =
      `mailto:${SUPPORT_EMAIL}` +
      `?subject=${encodeURIComponent(selected?.subject ?? '')}` +
      `&body=${encodeURIComponent(body)}`;
    void Linking.openURL(mailto);
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        leading={<BackButton />}
        title="Contact & Feedback"
        subtitle="We read every message. Your feedback shapes what gets built next."
      />
      <ScrollView>
        <View className="px-4 pt-4 pb-6 gap-5">
          <View>
            <Text className="text-xs font-medium text-secondary mb-2">What's this about?</Text>
            <View className="flex-row gap-2">
              {TYPES.map((t) => {
                const active = type === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setType(t.id)}
                    className="flex-1 items-center gap-1.5 py-3 rounded-xl border"
                    style={{
                      borderColor: active ? theme.primary : theme.border,
                      backgroundColor: active ? tint(theme.primary, 10) : undefined
                    }}
                  >
                    <Icon name={t.icon} size={20} color={active ? theme.primary : theme.textSecondary} />
                    <Text
                      className="text-[10px] font-medium text-center"
                      style={{ color: active ? theme.primary : theme.textSecondary }}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text className="text-xs font-medium text-secondary mb-2">Your message (optional)</Text>
            <RNTextInput
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={5}
              placeholder="Tell us more — what happened, what you expected, any ideas…"
              placeholderTextColor={theme.textTertiary}
              className="bg-surface-2 text-primary border w-full rounded-xl px-3 py-2.5 text-sm"
              style={{ borderColor: theme.border, textAlignVertical: 'top' }}
            />
            <Text className="text-[10px] text-tertiary mt-1">
              Opens your mail app with a pre-filled draft. Nothing is sent automatically.
            </Text>
          </View>

          <Pressable
            onPress={handleSend}
            className="flex-row items-center justify-center gap-2 w-full py-3 rounded-xl"
            style={{ backgroundColor: theme.primary }}
          >
            <Icon name="ti-send" size={18} color="#fff" />
            <Text className="text-sm font-semibold text-white">Open mail app</Text>
          </Pressable>

          <View className="border-t border-theme" />

          <View className="gap-3">
            {INFO_ROWS.map((row) => (
              <View key={row.title} className="flex-row items-start gap-3">
                <View className="w-8 h-8 rounded-lg items-center justify-center bg-surface-2">
                  <Icon name={row.icon} size={15} color={theme.textSecondary} />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-medium text-primary">{row.title}</Text>
                  <Text className="text-[11px] text-tertiary mt-0.5">{row.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
