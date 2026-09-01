// Ambient module declarations for bundled raster image assets imported via a plain ES `import`
// (Metro's asset resolver hands back a numeric asset id, valid as `Image`'s `source` prop) — added
// 2026-08-21 for the app-icon/Chip-icon rebrand (`PennyLogo.tsx`/`ChipAvatar.tsx`), the first place
// this codebase imports a raster asset directly rather than hand-drawing it with `react-native-svg`.
declare module '*.png' {
  const value: number;
  export default value;
}
