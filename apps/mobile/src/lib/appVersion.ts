import Constants from 'expo-constants';

/**
 * Live app version string, sourced from `app.json`'s `expo.version` field via `expo-constants`.
 * First introduced inline in `FeedbackPage.tsx` (its own local `APP_VERSION` constant); extracted here
 * once `AboutPennyPage.tsx` needed the identical value, so the two copies can't drift apart. Web has no
 * equivalent — it reads a Vite `__APP_VERSION__` define instead (see `FeedbackPage.tsx`'s doc comment).
 */
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
