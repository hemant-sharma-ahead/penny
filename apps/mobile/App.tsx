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
                    <RootNavigator />
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
