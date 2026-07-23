// Placeholder package entry point. Nothing imports @penny/core by its package name yet — apps/web-legacy
// resolves into packages/core/src directly via tsconfig/vite path mapping (see the comment in
// apps/web-legacy/tsconfig.app.json). This file exists only so package.json's main/types point somewhere
// valid; a curated public export surface is added when apps/mobile needs real package-boundary imports.
export {};
