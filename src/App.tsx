import { RouterProvider } from 'react-router-dom';
import { PrivacyProvider } from '@/context/PrivacyContext';
import { router } from '@/router';

export default function App() {
  return (
    <PrivacyProvider>
      <RouterProvider router={router} />
    </PrivacyProvider>
  );
}
