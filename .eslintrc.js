export default {
  extends: ['eslint:recommended'],
  rules: {
    // Formatting rules
    'indent': ['error', 2],
    'quotes': ['error', 'single', { 'avoidEscape': true }],
    'semi': ['error', true],
    'comma-dangle': ['error', 'always-multiline'],
    'arrow-parens': ['error', 'avoid'],
    'max-len': ['error', { 'code': 131 }],
    'object-curly-spacing': ['error', true],
    'linebreak-style': ['error', 'unix'],
    'eol-last': ['error', 'always'],
    'no-trailing-spaces': 'error',
    'key-spacing': ['error', { 'beforeColon': false, 'afterColon': true }],
    'comma-spacing': ['error', { 'before': false, 'after': true }],

    // Code quality rules from previous config
    'no-unused-vars': ['error', { ignoreRestSiblings: true }],
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    es6: true,
    browser: true,
    node: true,
  },
};
