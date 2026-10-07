import { usePrefs } from '../../state/prefs.js';
/** 'km' | 'mi' from the driver's preference. */
export const useUnit = () => (usePrefs().unit === 'mi' ? 'mi' : 'km');
