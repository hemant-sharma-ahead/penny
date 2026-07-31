import { createNavigationContainerRef } from '@react-navigation/native';
import type { MainStackParamList } from './MainNavigator';

/**
 * Imperative navigation handle for code that sits outside any `Stack.Navigator` screen — e.g.
 * `SessionGate`, which renders above `MainNavigator` entirely (so its own `useNavigation()`/`useRoute()`
 * would have no enclosing navigator to attach to). `SessionGate`'s successful-passphrase-unlock flow
 * uses this to push `ChangePin` with `forcedPinReset: true`, mirroring web's `useNavigate()` call in the
 * same spot. See https://reactnavigation.org/docs/navigating-without-navigation-prop/.
 */
export const navigationRef = createNavigationContainerRef<MainStackParamList>();
