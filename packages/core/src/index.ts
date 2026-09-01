// Placeholder package entry point. Nothing imports @penny/core by its package name — apps/mobile
// resolves into packages/core/src directly via its own `@/` path alias (matching how packages/core's
// own internal files resolve `@/core/...`), the same pattern apps/web-react used before its 2026-08-29
// retirement. This file exists only so package.json's main/types point somewhere valid; a curated
// public export surface can be added later if a real package-boundary import ever becomes necessary.
export {};
