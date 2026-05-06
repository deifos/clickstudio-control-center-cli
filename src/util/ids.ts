// Shared ID-shape detector. Used by every resolver to short-circuit when
// the caller passed something that's already a database ID (cuid, better-auth
// user id, or UUID with hyphens for synthetic agent users).
//   - cuid:           cmoto1odg000004k1a9qk40s2
//   - better-auth id: BOunxsmUC91CcGtDzkB7SHlPMSONwLFU
//   - agent UUID:     b58df686-5bc4-4f04-af80-db8f50c1cbcd
const ID_PATTERN = /^[a-zA-Z0-9-]{20,}$/;

export function looksLikeId(s: string): boolean {
  return ID_PATTERN.test(s);
}
