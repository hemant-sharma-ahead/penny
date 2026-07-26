import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';
import { IouView } from './IouView';

/**
 * Mobile-only top-level wrapper — web never gives IOU its own page (`IouView` is always embedded as the
 * Expenses module's IOU tab, see `apps/web-react/src/features/expenses/iou/IouSlice.tsx`). Since Expenses
 * hasn't been ported yet, this thin `PageHeader` shell exists purely so IOU is a coherent standalone
 * screen for this interim `AuthGuard` stand-in stage; it'll likely be replaced once Expenses lands and
 * `IouView` is embedded the same way web does it.
 */
export function IouPage() {
  const modeBg = useModeBackgroundColor();
  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader leading={<BackButton />} title="IOU" />
      <IouView />
    </SafeAreaView>
  );
}
