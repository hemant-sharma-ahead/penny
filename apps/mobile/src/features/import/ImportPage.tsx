import { Pressable, View, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PageHeader } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import type { PreviewRow } from '@/core/import/importPipeline';
import { useImport } from './useImport';
import { UploadStep } from './UploadStep';
import { PreviewSummaryCard, PreviewListTop, PreviewListBottom, PreviewRowItem, PreviewActions } from './PreviewStep';
import { DoneStep } from './DoneStep';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

/**
 * RN port of apps/web-react/src/features/import/ImportPage.tsx. Web's back button either navigates to
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
      {imp.step === 'preview' ? (
        // FlashList, not the ScrollView the other two steps use — bank exports commonly run hundreds
        // of rows, and rendering them all unvirtualized inside a ScrollView (via `.map()`) was flagged
        // as a real jank/OOM risk in the 2026-07-26 parity sweep; FlashList recycles rows instead of
        // FlatList's mount/unmount-on-scroll (see TransactionsTab.tsx for the full diagnosis).
        <FlashList
          className="flex-1 px-4"
          data={imp.preview}
          keyExtractor={(_row: PreviewRow, i: number) => String(i)}
          ItemSeparatorComponent={() => <View className="border-t border-theme" />}
          ListHeaderComponent={
            <>
              <PreviewSummaryCard
                preview={imp.preview}
                toImport={imp.toImport}
                unrecognisedCount={imp.unrecognisedCount}
                duplicateCount={imp.duplicateCount}
              />
              <PreviewListTop />
            </>
          }
          renderItem={({ item }) => <PreviewRowItem row={item} />}
          ListFooterComponent={
            <>
              <PreviewListBottom />
              <PreviewActions
                toImport={imp.toImport}
                importing={imp.importing}
                onBack={() => imp.setStep('upload')}
                onImport={() => void imp.runImport()}
              />
            </>
          }
        />
      ) : (
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

            {imp.step === 'done' && (
              <DoneStep importedCount={imp.importedCount} onDone={() => navigation.navigate('Expenses')} />
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
