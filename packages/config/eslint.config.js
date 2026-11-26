import tseslint from 'typescript-eslint';

const MESSAGE = 'استخدم الخصائص المنطقية (start/end) بدل left/right';

const PHYSICAL_PROPS =
  '^(left|right|marginLeft|marginRight|paddingLeft|paddingRight|borderLeft.*|borderRight.*)$';
// Tailwind physical utilities as whole class tokens (optionally with variants / negative sign).
const TW_TOKEN =
  '(^|\\s)(?:[\\w-]+:)*-?(?:ml-|mr-|pl-|pr-|left-|right-|text-left(?=$|\\s)|text-right(?=$|\\s))';

const rtlRules = [
  { selector: `Property[key.name=/${PHYSICAL_PROPS}/]`, message: MESSAGE },
  { selector: `Property[key.value=/${PHYSICAL_PROPS}/]`, message: MESSAGE },
  {
    selector: `Property[key.name='textAlign'][value.type='Literal'][value.value=/^(left|right)$/]`,
    message: MESSAGE,
  },
  {
    selector: `Property[key.value='textAlign'][value.type='Literal'][value.value=/^(left|right)$/]`,
    message: MESSAGE,
  },
  { selector: `Literal[value=/${TW_TOKEN}/]`, message: MESSAGE },
  { selector: `TemplateElement[value.raw=/${TW_TOKEN}/]`, message: MESSAGE },
];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.expo/**', '**/coverage/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-syntax': ['error', ...rtlRules],
    },
  },
  {
    // The rule definition and its fixture check necessarily contain physical names as data.
    files: ['**/eslint.config.js', '**/check-rtl-rule.mjs'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
