import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      // Generated reports and backend artifacts can be locked by OneDrive.
      ignored: ['**/output/**', '**/backend/**'],
    },
  },
});
