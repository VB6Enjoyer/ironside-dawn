import { version } from '../../package.json';

/** This build's version (package.json), shown in the app and stamped into saves and links. */
export const APP_VERSION: string = version;

/**
 * The first release. Saves and links that don't say which version made their
 * world are from it: earlier test versions' saves can't be loaded anyway.
 */
export const FIRST_RELEASE = '0.1.0';
