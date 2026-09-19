import { defineConfig } from '@playwright/test';

// Runs against the live hosted deployment by default (BASE_URL env override for local dev
// against `npm run dev`'s self-signed HTTPS server). No webServer here — the two deployment
// modes (LAN ws vs hosted Pusher) need genuinely different setups, and the highest-value test
// (the phone join handshake) specifically needs the real hosted Pusher/relay infrastructure,
// not a local mock.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL || 'https://bailarte-three.vercel.app',
    ignoreHTTPSErrors: true,
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
});
