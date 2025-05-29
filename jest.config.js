// Modern Jest config for ESM and WASM support
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.js'],
  transform: {},
  moduleNameMapper: {
    // Mock WASM imports for Node tests
    '\\.(wasm)$': '<rootDir>/src/utils/__mocks__/wasm_mock.js',
  },
  verbose: true,
};
