// Modern Jest config for ESM and WASM support
/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.js'],
  transform: {},
  moduleNameMapper: {
    '\\.(wasm)$': '<rootDir>/src/utils/__mocks__/wasm_mock.js',
  },
  verbose: true,
};

export default config;
