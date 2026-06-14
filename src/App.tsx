import { RouterProvider } from 'react-router-dom';
import { PrivacyProvider } from '@/context/PrivacyContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { EventModeProvider } from '@/context/EventModeContext';
import { router } from '@/router';

export default function App() {
  return (
    <PrivacyProvider>
      <SettingsProvider>
        <EventModeProvider>
          <RouterProvider router={router} />
        </EventModeProvider>
      </SettingsProvider>
    </PrivacyProvider>
  );
}
