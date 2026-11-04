// Where the Fonts view lives, for the headers that link to it (the tool's, the library's and its own): its clean
// address, /fonts, which the live site serves directly (fonts.html would redirect there first) and Vite's dev and
// preview servers resolve as well.
export const FONTS_URL = `${import.meta.env.BASE_URL}fonts`;
