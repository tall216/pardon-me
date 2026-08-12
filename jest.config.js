/** Jest config: ts-jest in a plain node env (pure logic only, no RN runtime). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
};
