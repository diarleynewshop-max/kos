import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The code under test runs in a WebView: it needs Blob/FileReader and DOM.
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
