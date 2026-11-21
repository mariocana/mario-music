// https://docs.expo.dev/guides/using-eslint/
//
// .cjs e non .js: package.json ha "type": "module", e un .js con require()
// verrebbe letto come modulo ES e non partirebbe (è quello che genera
// `npx expo lint` la prima volta).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'ios/*', 'android/*'],
  },
]);
