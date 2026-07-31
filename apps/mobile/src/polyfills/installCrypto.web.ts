// No-op on web: the browser already provides crypto.subtle natively, and react-native-quick-crypto has
// no web implementation (it's a native Nitro module) — must never be imported here.
export {};
