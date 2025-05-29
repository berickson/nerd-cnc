// Modern Jest config for ESM and WASM support
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '\\.(wasm)$': '<rootDir>/src/utils/__mocks__/wasm_mock.js',
  },
  verbose: true,
};
