const prettierRules = require('./.prettierrc.js');

module.exports = {
  extends: ['eslint:recommended', 'eslint-config-prettier'],
  rules: {
    'prettier/prettier': ['error', prettierRules],
    'no-unused-vars': ['error', { ignoreRestSiblings: true }],
  },
  plugins: ['eslint-plugin-prettier'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    es6: true,
    browser: true,
    node: true,
    jest: true,
  },
};
