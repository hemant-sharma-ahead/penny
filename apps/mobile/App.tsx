import './global.css';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { SettingsProvider } from './src/context/SettingsContext';
import { PrivacyProvider } from './src/context/PrivacyContext';
import { ToastProvider } from './src/context/ToastContext';
import { EventModeProvider } from './src/context/EventModeContext';
import { OnboardingDraftProvider } from './src/context/OnboardingDraftContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ErrorBoundary } from './src/components/shared/ErrorBoundary';

export default function App() {
  return (
    // Required once, at the root, for react-native-gesture-handler (Expenses' swipeable rows) to work.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* ToastProvider moved above Settings/Privacy (2026-08-29, punch-list item 12) so
              `PrivacyContext.tsx` can call `useToast()` directly for its one-time "Open default expired"
              toast — it previously sat between Privacy and EventMode, which put it out of reach of its
              own ancestors. Every existing `useToast()` call site further down the tree (inside
              `RootNavigator`) is unaffected: it's still nested inside all of these regardless of the
              providers' relative order among themselves. */}
          <ToastProvider>
            <SettingsProvider>
              <PrivacyProvider>
                <EventModeProvider>
                  <OnboardingDraftProvider>
                    {/* App-wide safety net (2026-08-13) — see ErrorBoundary.tsx's own doc comment for the
                        real crash this was added after. Inside every provider above so the fallback UI
                        itself still has theme/privacy/toast context available. */}
                    <ErrorBoundary>
                      <RootNavigator />
                    </ErrorBoundary>
                    <StatusBar style="auto" />
                  </OnboardingDraftProvider>
                </EventModeProvider>
              </PrivacyProvider>
            </SettingsProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
