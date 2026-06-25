import { RouterProvider } from 'react-router-dom';
import { PrivacyProvider } from '@/context/PrivacyContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { EventModeProvider } from '@/context/EventModeContext';
import { ToastProvider } from '@/context/ToastContext';
import { router } from '@/router';

export default function App() {
  return (
    <PrivacyProvider>
      <SettingsProvider>
        <EventModeProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </EventModeProvider>
      </SettingsProvider>
    </PrivacyProvider>
  );
}
