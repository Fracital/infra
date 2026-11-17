// Hero registry. Filenames and ids are FIXED -- see docs/CONTRACTS.md Appendix D.
import steve from './steve.js';
import alex from './alex.js';
import librarian from './librarian.js';
import tinkerer from './tinkerer.js';

export const HERO_LIST = [steve, alex, librarian, tinkerer];
export const HEROES = Object.fromEntries(HERO_LIST.map((h) => [h.id, h]));
