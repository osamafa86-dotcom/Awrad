export { lightColors, darkColors, space, radius, type } from './theme';
import tokensJson from './tokens.json';
export { tokensJson };
import type { lightColors as LightColors, type as TypeScale } from './theme';
export type ColorToken = keyof typeof LightColors;
export type TypeStyle = keyof typeof TypeScale;
