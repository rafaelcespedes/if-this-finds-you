// The product's name, as people see it. "Seedhand" stays in code and in storage keys (renaming those would
// lose people's saved drafts and settings).
export const APP_NAME = 'If This Finds You';

/** Engine credits name the project by its code name; people see the product's name. */
export const branded = (s: string) => s.replace(/\bSeedhand\b/g, APP_NAME);
