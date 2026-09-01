// Re-export the native module. On web, it will be resolved to ExpoSmsCaptureModule.web.ts
// and on native platforms to ExpoSmsCaptureModule.ts
export { default } from './src/ExpoSmsCaptureModule';
export * from './src/ExpoSmsCapture.types';
