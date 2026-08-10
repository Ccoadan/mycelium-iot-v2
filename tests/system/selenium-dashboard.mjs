import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const adminUsername = process.env.E2E_ADMIN_USERNAME;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const viewerUsername = process.env.E2E_VIEWER_USERNAME;
const viewerPassword = process.env.E2E_VIEWER_PASSWORD;
const headless = (process.env.E2E_HEADLESS ?? 'true').toLowerCase() !== 'false';
const screenshotDirectory = resolve(process.env.E2E_SCREENSHOT_DIR ?? 'reports/selenium');

if (!adminUsername || !adminPassword || !viewerUsername || !viewerPassword) {
  throw new Error(
    'Defina E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD, E2E_VIEWER_USERNAME y E2E_VIEWER_PASSWORD.',
  );
}

await mkdir(screenshotDirectory, { recursive: true });

const options = new chrome.Options().addArguments('--window-size=1440,1200');
if (headless) {
  options.addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage');
}

const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

async function capture(name) {
  const bytes = await driver.takeScreenshot();
  await writeFile(resolve(screenshotDirectory, `${name}.png`), bytes, 'base64');
}

async function login(username, password) {
  const overlay = await driver.wait(until.elementLocated(By.id('auth-overlay')), 10_000);
  if ((await overlay.getAttribute('hidden')) !== null) {
    await driver.findElement(By.id('auth-toggle')).click();
  }
  await driver.wait(until.elementIsVisible(overlay), 10_000);

  const usernameInput = await driver.findElement(By.id('login-username'));
  const passwordInput = await driver.findElement(By.id('login-password'));
  await usernameInput.clear();
  await usernameInput.sendKeys(username);
  await passwordInput.clear();
  await passwordInput.sendKeys(password);
  await driver.findElement(By.id('login-submit')).click();

  await driver.wait(async () => (await overlay.getAttribute('hidden')) !== null, 15_000);
  await driver.wait(until.elementTextIs(await driver.findElement(By.id('auth-username')), username), 10_000);
}

async function logout() {
  await driver.findElement(By.id('auth-toggle')).click();
  const overlay = await driver.findElement(By.id('auth-overlay'));
  await driver.wait(async () => (await overlay.getAttribute('hidden')) !== null, 10_000);
  await driver.wait(until.elementTextIs(await driver.findElement(By.id('auth-toggle')), 'Iniciar sesión'), 10_000);
}

try {
  await driver.get(baseUrl);
  await driver.wait(until.titleContains('Módulo Hongos'), 10_000);
  assert.match(await driver.findElement(By.id('login-title')).getText(), /Módulo Hongos/i);

  const overlay = await driver.findElement(By.id('auth-overlay'));
  await driver.wait(async () => (await overlay.getAttribute('hidden')) !== null, 10_000);
  await driver.wait(async () => {
    const value = await driver.findElement(By.id('history-count')).getText();
    return !/Esperando|Consultando/i.test(value);
  }, 15_000);
  assert.equal(await driver.findElement(By.id('simulation-toggle')).isEnabled(), false);
  assert.equal(await driver.findElement(By.css('[data-relay="relay1"]')).isEnabled(), false);
  await driver.findElement(By.id('camera-gallery-link')).click();
  await driver.wait(until.elementIsVisible(overlay), 10_000);
  assert.match(await driver.findElement(By.id('login-context')).getText(), /galería completa/i);
  await driver.findElement(By.id('login-continue')).click();
  await driver.wait(async () => (await overlay.getAttribute('hidden')) !== null, 10_000);
  await capture('00-public-dashboard');

  await login(adminUsername, adminPassword);
  assert.match(await driver.findElement(By.id('auth-role')).getText(), /Administrador/i);
  await driver.wait(async () => (await driver.findElements(By.css('.sensor-tile'))).length === 9, 15_000);
  await driver.wait(until.elementIsEnabled(await driver.findElement(By.id('simulation-toggle'))), 15_000);
  await driver.wait(async () => {
    const value = await driver.findElement(By.id('history-count')).getText();
    return !/Esperando|Consultando/i.test(value);
  }, 15_000);
  await driver.wait(async () => !/Acceso|Consultando/i.test(await driver.findElement(By.id('gallery-count')).getText()), 15_000);
  assert.equal(await driver.findElement(By.id('history-export')).isEnabled(), true);
  await capture('01-admin-dashboard');
  await logout();

  await login(viewerUsername, viewerPassword);
  assert.match(await driver.findElement(By.id('auth-role')).getText(), /Solo lectura/i);
  assert.equal(await driver.findElement(By.id('simulation-toggle')).isEnabled(), false);
  assert.equal(await driver.findElement(By.css('[data-relay="relay1"]')).isEnabled(), false);
  assert.equal(await driver.findElement(By.id('history-export')).isEnabled(), true);
  await capture('02-viewer-permissions');
  await logout();

  console.info(JSON.stringify({ status: 'passed', baseUrl, scenarios: 3 }, null, 2));
} catch (error) {
  await capture('99-failure').catch(() => undefined);
  throw error;
} finally {
  await driver.quit();
}
