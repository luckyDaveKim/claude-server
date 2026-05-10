#!/usr/bin/env node
/**
 * Setup Claude CLI config to skip onboarding screens
 * Based on GitHub issue #4714 - hasCompletedOnboarding is the key flag
 */

const fs = require('fs');
const path = require('path');

const home = process.env.HOME || '/home/node';

// Write to both possible config locations
const configPaths = [
  path.join(home, '.claude.json'),
  path.join(home, '.claude', 'settings.json'),
];

const config = {
  // Key flag per GitHub issue #4714
  hasCompletedOnboarding: true,
  // Additional flags that may be checked
  hasSeenOnboarding: true,
  hasSelectedTheme: true,
  hasSelectedBilling: true,
  theme: 'dark',
  preferredBilling: 'subscription',
  skipOnboarding: true,
  skipThemeSelection: true,
  skipBillingSelection: true,
  // permissions 불필요: --allowedTools + --permission-mode dontAsk 로 처리
};

for (const configPath of configPaths) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let existingConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      // Ignore parse errors
    }
  }

  const mergedConfig = { ...existingConfig, ...config };
  fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
  console.log('Claude config updated:', configPath);
}

console.log('Onboarding flags set successfully');
