import { RouterProvider } from 'react-router-dom';
import { PrivacyProvider } from '@/context/PrivacyContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { router } from '@/router';

export default function App() {
  return (
    <PrivacyProvider>
      <SettingsProvider>
        <RouterProvider router={router} />
      </SettingsProvider>
    </PrivacyProvider>
  );
}
