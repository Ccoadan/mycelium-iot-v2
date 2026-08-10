import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const adminUsername = process.env.E2E_ADMIN_USERNAME;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const viewerUsername = process.env.E2E_VIEWER_USERNAME;
const viewerPassword = process.env.E2E_VIEWER_PASSWORD;
const headless = (process.env.E2E_HEADLESS ?? 'true').toLowerCase() !== 'false';
const allowMutations = (process.env.E2E_ALLOW_MUTATIONS ?? 'false').toLowerCase() === 'true';
const artifactDirectory = resolve(process.env.E2E_ARTIFACT_DIR ?? 'reports/selenium');
const screenshotDirectory = resolve(process.env.E2E_SCREENSHOT_DIR ?? artifactDirectory);
const downloadDirectory = resolve(process.env.E2E_DOWNLOAD_DIR ?? resolve(artifactDirectory, 'downloads'));
const startedAt = new Date();
const scenarios = [];
let activeScenario = 'bootstrap';

if (!adminUsername || !adminPassword || !viewerUsername || !viewerPassword) {
  throw new Error(
    'Defina E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD, E2E_VIEWER_USERNAME y E2E_VIEWER_PASSWORD.',
  );
}

await Promise.all([
  mkdir(artifactDirectory, { recursive: true }),
  mkdir(screenshotDirectory, { recursive: true }),
  mkdir(downloadDirectory, { recursive: true }),
]);

const options = new chrome.Options().addArguments('--window-size=1440,1200');
options.setUserPreferences({
  'download.default_directory': downloadDirectory,
  'download.directory_upgrade': true,
  'download.prompt_for_download': false,
  'safebrowsing.enabled': true,
});
if (headless) {
  options.addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage');
}

const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

async function capture(name) {
  const bytes = await driver.takeScreenshot();
  await writeFile(resolve(screenshotDirectory, `${name}.png`), bytes, 'base64');
}

async function clickCentered(element) {
  await driver.executeScript(
    "arguments[0].scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });",
    element,
  );
  await driver.wait(until.elementIsVisible(element), 5_000);
  await driver.wait(until.elementIsEnabled(element), 5_000);
  await element.click();
}

async function writeResult(status, error = null) {
  const completedAt = new Date();
  const result = {
    status,
    baseUrl,
    headless,
    mutationsEnabled: allowMutations,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    activeScenario,
    scenarios,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  };
  await writeFile(resolve(artifactDirectory, 'results.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

function reportGitHubError(error) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const message = (error instanceof Error ? error.message : String(error))
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
  console.error(
    `::error file=tests/system/selenium-dashboard.mjs,title=Selenium · ${activeScenario}::${message}`,
  );
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

async function waitForPositiveCount(elementId, label) {
  const element = await driver.findElement(By.id(elementId));
  await driver.wait(async () => /\d/.test(await element.getText()), 15_000);
  const text = await element.getText();
  const count = Number(text.replace(/[^\d]/g, ''));
  assert.ok(Number.isInteger(count) && count > 0, `${label} debe contener datos, valor recibido: ${text}`);
  return count;
}

async function expectElementContent(elementId, pattern) {
  const element = await driver.findElement(By.id(elementId));
  await driver.wait(async () => pattern.test((await element.getAttribute('textContent')) ?? ''), 5_000);
  assert.match((await element.getAttribute('textContent')) ?? '', pattern);
}

async function exerciseRelay() {
  const relay = await driver.findElement(By.css('[data-relay="relay1"]'));
  const row = await driver.findElement(By.css('[data-control-row="relay1"]'));
  const toggle = await driver.findElement(By.css('[data-control-row="relay1"] .ios-toggle'));
  const originalState = await relay.isSelected();
  await clickCentered(toggle);
  try {
    await driver.wait(async () => (await relay.isSelected()) !== originalState, 10_000);
    await driver.wait(async () => !((await row.getAttribute('class')) ?? '').includes('is-busy'), 10_000);
    assert.equal(await relay.isSelected(), !originalState);
  } finally {
    if ((await relay.isSelected()) !== originalState) {
      await clickCentered(toggle);
      await driver.wait(async () => (await relay.isSelected()) === originalState, 10_000);
      await driver.wait(async () => !((await row.getAttribute('class')) ?? '').includes('is-busy'), 10_000);
    }
  }
}

async function openFirstGalleryPhoto() {
  const photos = await driver.wait(async () => {
    const cards = await driver.findElements(By.css('.photo-card'));
    return cards.length ? cards : false;
  }, 15_000);
  await clickCentered(photos[0]);
  const dialog = await driver.findElement(By.id('photo-dialog'));
  await driver.wait(async () => (await dialog.getAttribute('open')) !== null, 10_000);
  await driver.wait(until.elementIsVisible(await driver.findElement(By.id('photo-dialog-image'))), 10_000);
  await capture('02-viewer-gallery');
  await driver.findElement(By.id('photo-dialog-close')).click();
  await driver.wait(async () => (await dialog.getAttribute('open')) === null, 10_000);
}

async function downloadAndValidateCsv() {
  const previousFiles = new Set(await readdir(downloadDirectory));
  await clickCentered(await driver.findElement(By.id('history-export')));
  const csvFilename = await driver.wait(async () => {
    const files = await readdir(downloadDirectory);
    return files.find((filename) => filename.endsWith('.csv') && !previousFiles.has(filename)) ?? false;
  }, 20_000);
  const csv = await readFile(resolve(downloadDirectory, csvFilename), 'utf8');
  const normalized = csv.replace(/^\uFEFF/, '').trim();
  const lines = normalized.split(/\r?\n/);
  assert.equal(
    lines[0],
    'timestamp_utc,timestamp_lima,sensor_id,type,bag,value,unit,source',
    'El CSV debe conservar las cabeceras esperadas',
  );
  assert.ok(lines.length > 1, 'El CSV debe contener al menos una medición');
  return { filename: csvFilename, rows: lines.length - 1 };
}

try {
  activeScenario = 'public-dashboard';
  await driver.get(baseUrl);
  await driver.wait(until.titleContains('Módulo Hongos'), 10_000);
  const loginTitle = await driver.findElement(By.id('login-title')).getAttribute('textContent');
  assert.match(loginTitle, /Módulo Hongos/i);

  const overlay = await driver.findElement(By.id('auth-overlay'));
  await driver.wait(async () => (await overlay.getAttribute('hidden')) !== null, 10_000);
  const publicHistoryCount = await waitForPositiveCount('history-count', 'El historial público');
  await driver.wait(until.elementIsVisible(await driver.findElement(By.id('latest-photo-image'))), 15_000);
  assert.equal(await driver.findElement(By.id('simulation-toggle')).isEnabled(), false);
  assert.equal(await driver.findElement(By.css('[data-relay="relay1"]')).isEnabled(), false);

  await clickCentered(await driver.findElement(By.id('camera-gallery-link')));
  await driver.wait(until.elementIsVisible(overlay), 10_000);
  await expectElementContent('login-context', /galería completa/i);
  await driver.findElement(By.id('login-continue')).click();
  await driver.wait(async () => (await overlay.getAttribute('hidden')) !== null, 10_000);

  await clickCentered(await driver.findElement(By.id('history-export')));
  await driver.wait(until.elementIsVisible(overlay), 10_000);
  await expectElementContent('login-context', /CSV/i);
  await driver.findElement(By.id('login-continue')).click();
  await driver.wait(async () => (await overlay.getAttribute('hidden')) !== null, 10_000);
  await capture('00-public-dashboard');
  scenarios.push({ name: 'public-dashboard', status: 'passed', historyMeasurements: publicHistoryCount });

  activeScenario = 'admin-dashboard';
  await login(adminUsername, adminPassword);
  assert.match(await driver.findElement(By.id('auth-role')).getText(), /Administrador/i);
  await driver.wait(async () => (await driver.findElements(By.css('.sensor-tile'))).length === 9, 15_000);
  await driver.wait(until.elementIsEnabled(await driver.findElement(By.id('simulation-toggle'))), 15_000);
  const adminHistoryCount = await waitForPositiveCount('history-count', 'El historial administrativo');
  const adminGalleryCount = await waitForPositiveCount('gallery-count', 'La galería administrativa');
  assert.equal(await driver.findElement(By.id('history-export')).isEnabled(), true);
  if (allowMutations) await exerciseRelay();
  await capture('01-admin-dashboard');
  scenarios.push({
    name: 'admin-dashboard',
    status: 'passed',
    historyMeasurements: adminHistoryCount,
    galleryPhotos: adminGalleryCount,
    relayMutationVerified: allowMutations,
  });
  await logout();

  activeScenario = 'viewer-dashboard';
  await login(viewerUsername, viewerPassword);
  assert.match(await driver.findElement(By.id('auth-role')).getText(), /Solo lectura/i);
  assert.equal(await driver.findElement(By.id('simulation-toggle')).isEnabled(), false);
  assert.equal(await driver.findElement(By.css('[data-relay="relay1"]')).isEnabled(), false);
  assert.equal(await driver.findElement(By.id('history-export')).isEnabled(), true);
  const viewerGalleryCount = await waitForPositiveCount('gallery-count', 'La galería del viewer');
  await openFirstGalleryPhoto();
  const csv = await downloadAndValidateCsv();
  await capture('03-viewer-permissions');
  scenarios.push({
    name: 'viewer-dashboard',
    status: 'passed',
    galleryPhotos: viewerGalleryCount,
    csv,
  });
  await logout();

  activeScenario = 'completed';
  const result = await writeResult('passed');
  console.info(JSON.stringify(result, null, 2));
} catch (error) {
  reportGitHubError(error);
  await driver.findElement(By.id('login-password')).then((element) => element.clear()).catch(() => undefined);
  await capture('99-failure').catch(() => undefined);
  await writeResult('failed', error).catch(() => undefined);
  throw error;
} finally {
  await driver.quit();
}
