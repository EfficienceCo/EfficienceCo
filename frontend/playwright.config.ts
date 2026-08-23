import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Carrega .env.test manualmente (sem dependência de dotenv): sem isso,
// TEST_EMAIL/TEST_PASSWORD/BASE_URL ficam vazios a menos que sejam
// exportados manualmente no shell antes de cada `npx playwright test`.
// Variáveis já definidas no ambiente têm prioridade (não são sobrescritas).
const envTestPath = path.join(__dirname, '.env.test');
if (fs.existsSync(envTestPath)) {
  for (const linha of fs.readFileSync(envTestPath, 'utf-8').split('\n')) {
    const match = linha.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const [, chave, valor] = match;
      if (!(chave in process.env)) {
        process.env[chave] = valor;
      }
    }
  }
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
