import { Component, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Banner, Button } from '~/components/ui';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

interface Props {
  children: ReactNode;
  /** Shown above the error message — defaults to a generic explanation. Pass something specific to the
   *  screen this boundary wraps (e.g. "This import couldn't finish") so the fallback still orients the
   *  user, not just "something broke". */
  message?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/** The actual fallback UI, split out from the class boundary below so it can use hooks (theme
 *  background) — a class component's own `render()` can still mount a function component fine, React
 *  just calls its hooks when that inner component renders. */
function ErrorFallback({ message, error, onReset }: { message?: string; error: Error; onReset: () => void }) {
  const bg = useModeBackgroundColor();
  return (
    <View className="flex-1 items-center justify-center p-4 gap-3" style={{ backgroundColor: bg }}>
      <Banner variant="danger" title={message ?? 'Something went wrong'}>
        {error.message || 'This screen ran into an unexpected problem.'}
      </Banner>
      <Text className="text-xs text-tertiary text-center px-4">
        Your data is safe — this only affected the current screen.
      </Text>
      <Button variant="secondary" onPress={onReset}>
        Try again
      </Button>
    </View>
  );
}

/**
 * Root-level safety net (2026-08-13) — added after a real on-device crash: a MoneyView CSV import
 * where `parseFlexibleDate` silently rejected every single row on Hermes (a portable-parsing gap fixed
 * in `importMatcher.ts`, native-only — the same file parsed fine on RN Web/V8), and the resulting
 * 1500+ rejected rows then rendered as unvirtualized editors all at once (`UnparsedRows.tsx`, also
 * fixed). Investigating it surfaced a systemic gap underneath both bugs: apps/mobile had **zero** error
 * boundaries anywhere, so any render-time exception, anywhere, took down the whole app with no
 * recovery path and no explanation for the user — the exact opposite of this app's own standing
 * principle of never silently dropping/crashing without telling the user what happened (see e.g.
 * bank-import's `parseError` banners, `epfReviewFlags.ts`'s "never silently drop" comments throughout).
 *
 * This does NOT replace root-causing the underlying bug — fix the real bug first, always. This is only
 * the last line of defense for whatever the *next* one turns out to be: a caught render error becomes a
 * dismissable banner with a "Try again" reset, never a hard crash. Mounted once at the top of `App.tsx`
 * (every screen gets this for free) — `ImportPage.tsx` also wraps its own review step directly with a
 * screen-specific `message`, since a bad file is the single most likely place for a rendering surprise,
 * and a screen-scoped boundary lets the user retry just that import instead of losing the whole app
 * session (the outer, app-level boundary is still there as a fallback if this one somehow isn't). See
 * `CLAUDE.md`'s "Reliability" non-negotiables for the standing principle this codifies.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch() {
    // No explicit console.error here — the repo's `no-console` lint rule is zero-tolerance at
    // commit time, and React already logs a caught render error's stack to the console/LogBox by
    // default in dev builds on its own, so nothing is lost by not duplicating it here.
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorFallback
        message={this.props.message}
        error={error}
        onReset={() => {
          this.props.onReset?.();
          this.setState({ error: null });
        }}
      />
    );
  }
}
