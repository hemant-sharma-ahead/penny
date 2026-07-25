import { Pressable, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PageHeader } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { useImport } from './useImport';
import { UploadStep } from './UploadStep';
import { PreviewStep } from './PreviewStep';
import { DoneStep } from './DoneStep';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

/**
 * RN port of apps/web-legacy/src/features/import/ImportPage.tsx. Web's back button either navigates to
 * Expenses (upload step) or back to the upload step (preview/done step, since the wizard has no browser
 * history to pop within a single screen) — the preview/done case is a plain inline `Pressable` matching
 * `BackButton`'s look, not the shared `BackButton` itself, since that component is hardcoded to
 * `navigation.goBack()` and has no override for "reset local wizard state instead."
 */
export function ImportPage() {
  const modeBg = useModeBackgroundColor();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const theme = useThemeColors();
  const imp = useImport();

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader
        title="Import expenses"
        leading={
          imp.step === 'upload' ? (
            <BackButton />
          ) : (
            <Pressable
              onPress={() => imp.setStep('upload')}
              accessibilityLabel="Back"
              hitSlop={8}
              className="w-9 h-9 items-center justify-center rounded-full -ml-2"
            >
              <Icon name="ti-arrow-left" size={20} color={theme.textSecondary} />
            </Pressable>
          )
        }
      />
      <ScrollView>
        <View className="px-4 py-4 gap-4">
          {imp.step === 'upload' && (
            <UploadStep
              format={imp.format}
              setFormat={imp.setFormat}
              parseError={imp.parseError}
              onText={imp.importFromText}
            />
          )}

          {imp.step === 'preview' && (
            <PreviewStep
              preview={imp.preview}
              toImport={imp.toImport}
              unrecognisedCount={imp.unrecognisedCount}
              duplicateCount={imp.duplicateCount}
              importing={imp.importing}
              onBack={() => imp.setStep('upload')}
              onImport={() => void imp.runImport()}
            />
          )}

          {imp.step === 'done' && (
            <DoneStep importedCount={imp.importedCount} onDone={() => navigation.navigate('Expenses')} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
