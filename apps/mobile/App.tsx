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
          <SettingsProvider>
            <PrivacyProvider>
              <ToastProvider>
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
              </ToastProvider>
            </PrivacyProvider>
          </SettingsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
