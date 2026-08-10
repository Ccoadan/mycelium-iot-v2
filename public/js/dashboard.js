const SVG_NS = 'http://www.w3.org/2000/svg';
const REFRESH_INTERVAL_MS = 10_000;
const HISTORY_REFRESH_MS = 30_000;
const HISTORY_PAGE_SIZE = 25;
const PHOTO_REFRESH_MS = 60_000;
const PHOTO_PAGE_SIZE = 6;
const DASHBOARD_REQUEST_HEADER = 'mycelium-dashboard';

const AMBIENT_TYPES = {
  temperature_environment: { label: 'Temperatura ambiental', color: '#ef6c54', unit: '°C' },
  humidity_environment: { label: 'Humedad ambiental', color: '#4a90d9', unit: '%' },
  co2_environment: { label: 'CO₂ ambiental', color: '#34c759', unit: 'ppm' },
};

const MEASUREMENT_TYPE_LABELS = {
  temperature_environment: 'Temperatura ambiental',
  humidity_environment: 'Humedad ambiental',
  co2_environment: 'CO₂ ambiental',
  temperature_bag: 'Temperatura de bolsa',
  humidity_bag: 'Humedad de bolsa',
};

const BAGS = [
  { name: 'Bolsa 1', species: 'Pleurotus ostreatus', badge: 'Esterilizado', color: '#d4edda' },
  { name: 'Bolsa 2', species: 'Ganoderma lucidum', badge: 'Pasteurizado', color: '#fde8d8' },
  { name: 'Bolsa 3', species: 'Pleurotus ostreatus', badge: 'Control', color: '#e8e8f4' },
  { name: 'Bolsa 4', species: 'Hericium erinaceus', badge: 'Esterilizado', color: '#fff3d4' },
  { name: 'Bolsa 5', species: 'Lentinula edodes', badge: 'Pasteurizado', color: '#dff0f8' },
  { name: 'Bolsa 6', species: 'Ganoderma lucidum', badge: 'Esterilizado', color: '#fce4ec' },
  { name: 'Bolsa 7', species: 'Pleurotus eryngii', badge: 'Control', color: '#e4f5ec' },
  { name: 'Bolsa 8', species: 'Hericium erinaceus', badge: 'Pasteurizado', color: '#f0e4fc' },
  { name: 'Bolsa 9', species: 'Lentinula edodes', badge: 'Esterilizado', color: '#fff8e1' },
];

const state = {
  latest: [],
  summary: { configured: 21, active: 21, reporting: 0, stale: 0 },
  ambientType: 'temperature_environment',
  sensorType: 'temperature_bag',
  selectedBag: 1,
  simulatorRunning: false,
  user: null,
  control: null,
  controlBusy: new Set(),
  historyPage: 1,
  historyTotalPages: 0,
  historyLoading: false,
  photoPage: 1,
  photoTotalPages: 0,
  photoTotal: 0,
  photoLoading: false,
  latestPhotoLoading: false,
  latestPhoto: null,
  photos: [],
  refreshing: false,
  ambientRequest: 0,
  bagRequest: 0,
};

const elements = Object.fromEntries(
  [
    'system-pill', 'system-label', 'simulator-status', 'simulation-toggle', 'clock', 'system-summary',
    'last-refresh', 'api-service', 'mongodb-service', 'simulator-service', 'ambient-tabs', 'ambient-chart',
    'ambient-chart-meta', 'co2-value', 'co2-gauge', 'co2-badge', 'ambient-temperature', 'ambient-humidity',
    'latest-time', 'reporting-sensors', 'average-temperature', 'average-humidity', 'sensor-tabs', 'sensors-grid',
    'bag-name', 'bag-species', 'bag-select', 'bag-image', 'bag-image-bg', 'bag-badge', 'bag-chart-title',
    'bag-chart', 'bag-temperature', 'bag-humidity', 'control-role-chip', 'control-context',
    'control-updated-at', 'control-updated-by', 'auth-user', 'auth-username', 'auth-role', 'auth-toggle',
    'auth-overlay', 'login-form', 'login-username', 'login-password', 'login-context', 'login-error', 'login-submit',
    'login-close', 'login-continue',
    'history-filters', 'history-from', 'history-to', 'history-type', 'history-sensor', 'history-bag',
    'history-apply', 'history-export', 'history-count', 'history-range', 'history-table-body',
    'history-prev', 'history-next', 'history-page', 'toast-wrap',
    'latest-photo-open', 'latest-photo-image', 'latest-photo-empty', 'latest-photo-date', 'latest-photo-source',
    'camera-gallery-link', 'photo-gallery-section', 'photo-gallery', 'gallery-count', 'gallery-prev', 'gallery-next',
    'gallery-page', 'photo-dialog', 'photo-dialog-close', 'photo-dialog-image', 'photo-dialog-title', 'photo-dialog-meta',
  ].map((id) => [id, document.getElementById(id)]),
);

const limaDateTime = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  dateStyle: 'medium',
  timeStyle: 'medium',
});
const limaTime = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const compactNumber = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

async function requestJson(url, options = {}) {
  const { headers: additionalHeaders = {}, ...requestOptions } = options;
  const response = await fetch(url, {
    ...requestOptions,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': DASHBOARD_REQUEST_HEADER,
      ...additionalHeaders,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `La solicitud falló con HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function renderAuthentication() {
  const authenticated = Boolean(state.user);
  elements['auth-user'].hidden = !authenticated;
  elements['auth-username'].textContent = state.user?.username ?? '—';
  elements['auth-role'].textContent = state.user?.role === 'admin' ? 'Administrador' : 'Solo lectura';
  elements['auth-toggle'].textContent = authenticated ? 'Cerrar sesión' : 'Iniciar sesión';
  elements['simulation-toggle'].disabled = state.user?.role !== 'admin';
  elements['history-apply'].disabled = state.historyLoading;
  elements['history-export'].disabled = state.historyLoading;
  elements['history-export'].title = authenticated ? 'Descargar mediciones en CSV' : 'Inicia sesión para descargar datos';
  if (!authenticated) {
    elements['gallery-prev'].disabled = true;
    elements['gallery-next'].disabled = true;
  }
}

function showLogin(contextMessage = '') {
  elements['auth-overlay'].hidden = false;
  elements['login-context'].hidden = !contextMessage;
  elements['login-context'].textContent = contextMessage;
  elements['login-error'].hidden = true;
  elements['login-error'].textContent = '';
  setTimeout(() => elements['login-username'].focus(), 0);
}

function hideLogin() {
  elements['auth-overlay'].hidden = true;
  elements['login-context'].hidden = true;
  elements['login-context'].textContent = '';
  elements['login-error'].hidden = true;
  elements['login-error'].textContent = '';
  elements['login-password'].value = '';
}

function clearAuthenticatedState() {
  state.user = null;
  state.control = null;
  state.photos = [];
  state.photoPage = 1;
  state.photoTotalPages = 0;
  state.photoTotal = 0;
  state.photoLoading = false;
  renderAuthentication();
  renderControl();
  renderGallery();
  closePhotoDialog();
}

function handleSessionExpired(message = 'La sesión terminó. Inicia sesión nuevamente.') {
  clearAuthenticatedState();
  showLogin(message);
  void refreshControl();
}

async function refreshSession() {
  try {
    const payload = await requestJson('/api/auth/me');
    state.user = payload.user;
    renderAuthentication();
    hideLogin();
    return true;
  } catch (error) {
    clearAuthenticatedState();
    hideLogin();
    if (error.status !== 401) toast('No fue posible comprobar la sesión. El monitoreo público sigue disponible.', true);
    return false;
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const username = elements['login-username'].value.trim();
  const password = elements['login-password'].value;
  elements['login-submit'].disabled = true;
  elements['login-submit'].textContent = 'Verificando…';
  elements['login-error'].hidden = true;
  try {
    const payload = await requestJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    state.user = payload.user;
    renderAuthentication();
    hideLogin();
    await refreshAll();
    await refreshGallery(1);
    toast(`Sesión iniciada · ${payload.user.username}`);
  } catch (error) {
    elements['login-password'].value = '';
    elements['login-error'].textContent = error.message;
    elements['login-error'].hidden = false;
    elements['login-password'].focus();
  } finally {
    elements['login-submit'].disabled = false;
    elements['login-submit'].textContent = 'Iniciar sesión';
  }
}

async function logout() {
  try {
    await requestJson('/api/auth/logout', { method: 'POST' });
    clearAuthenticatedState();
    hideLogin();
    await refreshControl();
    toast('Sesión cerrada correctamente. El monitoreo continúa en modo público.');
  } catch (error) {
    if (error.status === 401) handleSessionExpired();
    else toast(error.message, true);
  }
}

function updateClock() {
  elements.clock.textContent = limaTime.format(new Date());
}

function latestMeasurement(type, sensorId) {
  return state.latest.find((measurement) => measurement.type === type && measurement.sensorId === sensorId);
}

function formatMeasurement(measurement, decimals = 1) {
  if (!measurement || measurement.value === null) return `-- ${measurement?.unit ?? ''}`.trim();
  return `${Number(measurement.value).toFixed(decimals)} ${measurement.unit}`;
}

function formatTimestamp(timestamp, includeDate = false) {
  if (!timestamp) return 'Sin lectura';
  const date = new Date(timestamp);
  return includeDate ? limaDateTime.format(date) : limaTime.format(date).slice(0, 5);
}

function limaInputValue(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function limaInputToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    throw new Error('Selecciona fechas válidas para el historial');
  }
  const timestamp = new Date(`${value.length === 16 ? `${value}:00` : value}-05:00`);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('Selecciona fechas válidas para el historial');
  return timestamp.toISOString();
}

function setHistoryDefaults() {
  const now = new Date();
  elements['history-to'].value = limaInputValue(now);
  elements['history-from'].value = limaInputValue(new Date(now.getTime() - 24 * 60 * 60 * 1_000));
}

function buildHistoryParameters(includePagination = true) {
  const parameters = new URLSearchParams({
    from: limaInputToIso(elements['history-from'].value),
    to: limaInputToIso(elements['history-to'].value),
  });
  if (elements['history-type'].value) parameters.set('type', elements['history-type'].value);
  if (elements['history-sensor'].value) parameters.set('sensorId', elements['history-sensor'].value);
  if (elements['history-bag'].value) parameters.set('bag', elements['history-bag'].value);
  if (includePagination) {
    parameters.set('page', String(state.historyPage));
    parameters.set('pageSize', String(HISTORY_PAGE_SIZE));
    parameters.set('sort', 'desc');
  }
  return parameters;
}

function setHistoryBusy(busy) {
  state.historyLoading = busy;
  elements['history-apply'].disabled = busy;
  elements['history-export'].disabled = busy;
  if (busy) {
    elements['history-count'].textContent = 'Consultando historial…';
    elements['history-prev'].disabled = true;
    elements['history-next'].disabled = true;
  }
}

function renderHistory(payload = null, emptyMessage = 'Esperando la primera consulta pública.') {
  const body = elements['history-table-body'];
  body.replaceChildren();
  if (!payload || payload.measurements.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'history-empty';
    cell.textContent = payload ? 'No existen mediciones para los filtros seleccionados.' : emptyMessage;
    row.append(cell);
    body.append(row);
  } else {
    payload.measurements.forEach((measurement) => {
      const row = document.createElement('tr');
      const values = [
        formatTimestamp(measurement.timestamp, true),
        measurement.sensorId === 0 ? 'Sensor 0 · Ambiente' : `Sensor ${measurement.sensorId}`,
        MEASUREMENT_TYPE_LABELS[measurement.type] ?? measurement.type,
        measurement.bag ? `Bolsa ${measurement.bag}` : '—',
        `${compactNumber.format(measurement.value)} ${measurement.unit}`,
        measurement.source === 'simulator' ? 'Simulador' : 'Importación histórica',
      ];
      values.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
  }

  const pagination = payload?.pagination;
  state.historyTotalPages = pagination?.totalPages ?? 0;
  elements['history-count'].textContent = pagination
    ? `${pagination.total.toLocaleString('es-PE')} mediciones encontradas`
    : 'Esperando consulta';
  elements['history-range'].textContent = payload
    ? `${formatTimestamp(payload.query.from, true)} → ${formatTimestamp(payload.query.to, true)}`
    : 'Fechas mostradas en America/Lima';
  elements['history-page'].textContent = pagination?.totalPages
    ? `Página ${pagination.page} de ${pagination.totalPages}`
    : 'Sin páginas';
  elements['history-prev'].disabled = state.historyLoading || !pagination || pagination.page <= 1;
  elements['history-next'].disabled =
    state.historyLoading || !pagination || pagination.totalPages === 0 || pagination.page >= pagination.totalPages;
}

async function refreshHistory(page = 1) {
  state.historyPage = page;
  setHistoryBusy(true);
  try {
    const payload = await requestJson(`/api/measurements/history?${buildHistoryParameters()}`);
    renderHistory(payload);
  } catch (error) {
    if (error.status === 401 && state.user) {
      handleSessionExpired();
      return;
    }
    renderHistory(null, error.message);
    toast(error.message, true);
  } finally {
    setHistoryBusy(false);
    elements['history-prev'].disabled = state.historyPage <= 1;
    elements['history-next'].disabled =
      state.historyTotalPages === 0 || state.historyPage >= state.historyTotalPages;
  }
}

async function downloadHistoryCsv() {
  if (!state.user) {
    showLogin('Inicia sesión para descargar las mediciones en formato CSV.');
    return;
  }
  const button = elements['history-export'];
  button.disabled = true;
  button.textContent = 'Preparando…';
  try {
    const response = await fetch(`/api/export/csv?${buildHistoryParameters(false)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': DASHBOARD_REQUEST_HEADER },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const error = new Error(payload?.error?.message ?? `La exportación falló con HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'mycelium_measurements.csv';
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    const rows = response.headers.get('X-Export-Count') ?? '0';
    toast(`CSV generado · ${rows} filas`);
  } catch (error) {
    if (error.status === 401) handleSessionExpired();
    else toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Descargar CSV';
  }
}

function synchronizeHistoryFilters(source) {
  const type = elements['history-type'].value;
  const sensor = elements['history-sensor'].value;
  const bag = elements['history-bag'].value;
  const environmentType = type.endsWith('_environment');
  const bagType = type.endsWith('_bag');

  if (source === 'type' && environmentType) {
    elements['history-sensor'].value = '0';
    elements['history-bag'].value = '';
  } else if (source === 'type' && bagType && sensor === '0') {
    elements['history-sensor'].value = '';
  } else if (source === 'bag' && bag) {
    elements['history-sensor'].value = bag;
    if (environmentType) elements['history-type'].value = '';
  } else if (source === 'sensor' && sensor === '0') {
    elements['history-bag'].value = '';
    if (bagType) elements['history-type'].value = '';
  } else if (source === 'sensor' && sensor && environmentType) {
    elements['history-type'].value = '';
  }

  elements['history-bag'].disabled = elements['history-type'].value.endsWith('_environment');
}

function photoSourceLabel(source) {
  return source === 'historical' ? 'Archivo histórico' : 'Cámara simulada';
}

function formatFileSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes)) return 'Tamaño no disponible';
  return `${Math.max(1, Math.round(sizeBytes / 1024)).toLocaleString('es-PE')} KB`;
}

function renderLatestPhoto(emptyMessage = '') {
  const latest = state.latestPhoto;
  const latestImage = elements['latest-photo-image'];
  const latestEmpty = elements['latest-photo-empty'];
  if (latest) {
    latestImage.src = latest.imageUrl;
    latestImage.alt = `Última captura del módulo, ${formatTimestamp(latest.capturedAt, true)}`;
    latestImage.hidden = false;
    latestEmpty.hidden = true;
    elements['latest-photo-open'].disabled = state.latestPhotoLoading;
    elements['latest-photo-date'].textContent = formatTimestamp(latest.capturedAt, true);
    elements['latest-photo-source'].textContent = photoSourceLabel(latest.source);
  } else {
    latestImage.removeAttribute('src');
    latestImage.alt = '';
    latestImage.hidden = true;
    latestEmpty.hidden = false;
    latestEmpty.querySelector('strong').textContent = state.latestPhotoLoading ? 'Consultando cámara' : 'Sin fotografías';
    latestEmpty.querySelector('small').textContent = emptyMessage || 'Todavía no hay capturas publicadas';
    elements['latest-photo-open'].disabled = true;
    elements['latest-photo-date'].textContent = 'Sin fotografía';
    elements['latest-photo-source'].textContent = '—';
  }
}

function renderGallery(emptyMessage = '') {
  const gallery = elements['photo-gallery'];
  gallery.replaceChildren();

  if (!state.user) {
    const locked = document.createElement('div');
    locked.className = 'gallery-empty gallery-auth';
    const title = document.createElement('strong');
    title.textContent = 'Galería completa protegida';
    const copy = document.createElement('span');
    copy.textContent = 'Inicia sesión como viewer o administrador para consultar todas las fotografías.';
    const login = document.createElement('button');
    login.type = 'button';
    login.textContent = 'Iniciar sesión';
    login.addEventListener('click', () => showLogin('Inicia sesión para ver la galería completa.'));
    locked.append(title, copy, login);
    gallery.append(locked);
    elements['gallery-count'].textContent = 'Acceso requerido';
    elements['gallery-page'].textContent = 'Sesión requerida';
    elements['gallery-prev'].disabled = true;
    elements['gallery-next'].disabled = true;
    return;
  }

  if (!state.photos.length) {
    const message = document.createElement('div');
    message.className = 'gallery-empty';
    message.textContent = state.photoLoading
      ? 'Consultando fotografías…'
      : emptyMessage || 'No existen fotografías publicadas.';
    gallery.append(message);
  } else {
    state.photos.forEach((photo) => {
      const button = document.createElement('button');
      button.className = 'photo-card';
      button.type = 'button';
      button.addEventListener('click', () => openPhoto(photo));
      const image = document.createElement('img');
      image.src = photo.imageUrl;
      image.alt = `Captura del módulo del ${formatTimestamp(photo.capturedAt, true)}`;
      image.loading = 'lazy';
      const copy = document.createElement('span');
      copy.className = 'photo-card-copy';
      const main = document.createElement('span');
      const date = document.createElement('strong');
      date.textContent = formatTimestamp(photo.capturedAt, true);
      const source = document.createElement('small');
      source.textContent = photoSourceLabel(photo.source);
      const size = document.createElement('small');
      size.textContent = formatFileSize(photo.metadata.sizeBytes);
      main.append(date, source);
      copy.append(main, size);
      button.append(image, copy);
      gallery.append(button);
    });
  }

  elements['gallery-count'].textContent = `${state.photoTotal.toLocaleString('es-PE')} fotografías`;
  elements['gallery-page'].textContent = state.photoTotalPages
    ? `Página ${state.photoPage} de ${state.photoTotalPages}`
    : 'Sin páginas';
  elements['gallery-prev'].disabled = state.photoLoading || state.photoPage <= 1;
  elements['gallery-next'].disabled =
    state.photoLoading || state.photoTotalPages === 0 || state.photoPage >= state.photoTotalPages;
}

async function refreshLatestPhoto() {
  if (state.latestPhotoLoading) return;
  state.latestPhotoLoading = true;
  renderLatestPhoto();
  let emptyMessage = '';
  try {
    const latest = await requestJson('/api/photos/latest');
    state.latestPhoto = latest.photo;
  } catch (error) {
    state.latestPhoto = null;
    emptyMessage = error.message;
  } finally {
    state.latestPhotoLoading = false;
    renderLatestPhoto(emptyMessage);
  }
}

async function refreshGallery(page = 1) {
  if (!state.user || state.photoLoading) return;
  state.photoLoading = true;
  state.photoPage = page;
  renderGallery();
  let emptyMessage = '';
  try {
    const gallery = await requestJson(`/api/photos?page=${page}&pageSize=${PHOTO_PAGE_SIZE}`);
    state.photos = gallery.photos;
    state.photoPage = gallery.pagination.page;
    state.photoTotal = gallery.pagination.total;
    state.photoTotalPages = gallery.pagination.totalPages;
  } catch (error) {
    if (error.status === 401) {
      handleSessionExpired();
      return;
    }
    state.photos = [];
    state.photoTotal = 0;
    state.photoTotalPages = 0;
    emptyMessage = error.message;
    toast(error.message, true);
  } finally {
    state.photoLoading = false;
    renderGallery(emptyMessage);
  }
}

function openPhoto(photo) {
  if (!photo) return;
  const image = elements['photo-dialog-image'];
  image.src = photo.imageUrl;
  image.alt = `Captura ampliada del módulo del ${formatTimestamp(photo.capturedAt, true)}`;
  elements['photo-dialog-title'].textContent = formatTimestamp(photo.capturedAt, true);
  const dimensions = photo.metadata.width && photo.metadata.height
    ? `${photo.metadata.width}×${photo.metadata.height}`
    : 'Resolución no disponible';
  elements['photo-dialog-meta'].textContent =
    `${photoSourceLabel(photo.source)} · ${dimensions} · ${formatFileSize(photo.metadata.sizeBytes)} · ${photo.filename}`;
  elements['photo-dialog'].showModal();
}

function closePhotoDialog() {
  if (elements['photo-dialog'].open) elements['photo-dialog'].close();
  elements['photo-dialog-image'].removeAttribute('src');
}

function setServiceState(element, stateName) {
  element.classList.remove('is-up', 'is-down', 'is-paused');
  element.classList.add(stateName);
}

async function refreshHealth() {
  try {
    const health = await requestJson('/api/health');
    const mongodbUp = health.services.mongodb.status === 'up';
    state.simulatorRunning = health.services.simulator?.status === 'running';

    elements['system-pill'].className = 'pill-status';
    elements['system-label'].textContent = mongodbUp ? 'Sistema disponible' : 'Servicio degradado';
    elements['simulator-status'].textContent = state.simulatorRunning ? 'Simulador activo' : 'Simulador en pausa';
    elements['simulator-status'].classList.toggle('is-running', state.simulatorRunning);
    elements['simulation-toggle'].textContent = state.simulatorRunning ? 'Detener simulador' : 'Iniciar simulador';
    elements['simulation-toggle'].disabled = state.user?.role !== 'admin';
    elements['system-summary'].textContent = state.simulatorRunning
      ? 'Servicios listos · generando mediciones'
      : 'Servicios listos · simulador en pausa';

    setServiceState(elements['api-service'], 'is-up');
    setServiceState(elements['mongodb-service'], mongodbUp ? 'is-up' : 'is-down');
    setServiceState(elements['simulator-service'], state.simulatorRunning ? 'is-up' : 'is-paused');
  } catch (error) {
    elements['system-pill'].className = 'pill-status is-error';
    elements['system-label'].textContent = 'Sin conexión';
    elements['system-summary'].textContent = 'No fue posible consultar la API';
    elements['simulation-toggle'].disabled = true;
    setServiceState(elements['api-service'], 'is-down');
    setServiceState(elements['mongodb-service'], 'is-down');
    setServiceState(elements['simulator-service'], 'is-down');
    throw error;
  }
}

async function refreshLatest() {
  const payload = await requestJson('/api/measurements/latest');
  state.latest = payload.measurements;
  state.summary = payload.summary;
  renderLatest();
}

async function refreshControl() {
  if (state.controlBusy.size) return;
  const payload = await requestJson('/api/control');
  state.control = payload.control;
  renderControl();
}

function renderControl() {
  const control = state.control;
  const actor = control?.actor;
  const canModify = state.user?.role === 'admin' && control?.permissions?.canModify === true;

  elements['control-role-chip'].className = `phase-chip ${canModify ? 'is-admin' : 'is-viewer'}`;
  elements['control-role-chip'].textContent = !state.user
    ? 'Público · Solo lectura'
    : actor
    ? `${actor.role === 'admin' ? 'Administrador' : 'Solo lectura'} · ${actor.username}`
    : 'Sin identidad';
  elements['control-context'].textContent = !state.user
    ? 'El estado de los relés es público. Inicia sesión como administrador para modificarlos.'
    : canModify
    ? 'Control simulado habilitado. Cada cambio se guarda en MongoDB y deja una traza de auditoría.'
    : 'El estado es visible, pero este rol no puede modificar relés.';

  document.querySelectorAll('[data-relay]').forEach((input) => {
    const relay = control?.relays.find(({ key }) => key === input.dataset.relay);
    const busy = state.controlBusy.has(input.dataset.relay);
    const row = document.querySelector(`[data-control-row="${input.dataset.relay}"]`);
    const status = document.querySelector(`[data-control-status="${input.dataset.relay}"]`);
    input.checked = relay?.enabled === true;
    input.disabled = !relay || !canModify || busy;
    row?.classList.toggle('is-busy', busy);
    if (status) {
      status.textContent = busy ? 'Guardando…' : relay?.enabled ? 'Encendido' : relay ? 'Apagado' : 'No disponible';
      status.classList.toggle('is-enabled', relay?.enabled === true);
    }
  });

  elements['control-updated-at'].textContent = control?.updatedAt
    ? `Actualizado ${formatTimestamp(control.updatedAt, true)}`
    : 'Sin cambios registrados';
  elements['control-updated-by'].textContent = state.user && control?.updatedBy ? `Por ${control.updatedBy}` : 'MongoDB';
}

function renderLatest() {
  const temperature = latestMeasurement('temperature_environment', 0);
  const humidity = latestMeasurement('humidity_environment', 0);
  const co2 = latestMeasurement('co2_environment', 0);
  const bagTemperatures = state.latest.filter(({ type, value }) => type === 'temperature_bag' && value !== null);
  const bagHumidities = state.latest.filter(({ type, value }) => type === 'humidity_bag' && value !== null);
  const timestamps = state.latest.map(({ timestamp }) => timestamp).filter(Boolean).map((value) => new Date(value).getTime());
  const mostRecent = timestamps.length ? new Date(Math.max(...timestamps)) : null;

  elements['ambient-temperature'].textContent = formatMeasurement(temperature, 1);
  elements['ambient-humidity'].textContent = formatMeasurement(humidity, 1);
  elements['latest-time'].textContent = mostRecent ? formatTimestamp(mostRecent.toISOString()) : 'Sin datos';
  elements['reporting-sensors'].textContent = `${state.summary.reporting} / ${state.summary.active}`;
  elements['average-temperature'].textContent = formatAverage(bagTemperatures, '°C');
  elements['average-humidity'].textContent = formatAverage(bagHumidities, '%');
  elements['last-refresh'].textContent = `Actualizado ${limaDateTime.format(new Date())}`;

  renderCo2(co2?.value ?? null);
  renderSensorGrid();
  renderSelectedBag();
}

function formatAverage(measurements, unit) {
  if (!measurements.length) return `-- ${unit}`;
  const average = measurements.reduce((total, { value }) => total + value, 0) / measurements.length;
  return `${average.toFixed(1)} ${unit}`;
}

function renderCo2(value) {
  elements['co2-value'].textContent = value === null ? '----' : Math.round(value).toString();
  const percentage = value === null ? 0 : Math.min(100, Math.max(0, (value / 3_000) * 100));
  elements['co2-gauge'].style.width = `${percentage}%`;
  elements['co2-gauge'].style.background = value !== null && value > 2_000 ? '#ff3b30' : value !== null && value > 1_500 ? '#ff9f0a' : '#34c759';
  elements['co2-badge'].className = 'co2-badge';
  if (value === null) {
    elements['co2-badge'].textContent = 'SIN DATOS';
  } else if (value > 2_000) {
    elements['co2-badge'].textContent = 'ALTO';
    elements['co2-badge'].classList.add('is-alert');
  } else if (value > 1_500) {
    elements['co2-badge'].textContent = 'ELEVADO';
    elements['co2-badge'].classList.add('is-high');
  } else {
    elements['co2-badge'].textContent = 'NORMAL';
  }
}

function renderSensorGrid() {
  const grid = elements['sensors-grid'];
  grid.replaceChildren();

  for (let bag = 1; bag <= 9; bag += 1) {
    const measurement = latestMeasurement(state.sensorType, bag);
    const value = measurement?.value;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `sensor-tile ${sensorRangeClass(state.sensorType, value)} ${sensorStatusClass(measurement?.status)}`;
    tile.classList.toggle('is-selected', bag === state.selectedBag);
    tile.setAttribute('aria-label', `${BAGS[bag - 1].name}: ${formatMeasurement(measurement)}`);
    tile.addEventListener('click', () => selectBag(bag));

    const status = document.createElement('i');
    status.className = 'sensor-status';
    status.title = statusLabel(measurement?.status);
    const number = document.createElement('div');
    number.className = 'sensor-number';
    number.textContent = `BOLSA ${bag}`;
    const valueElement = document.createElement('div');
    valueElement.className = 'sensor-value';
    valueElement.textContent = value === null || value === undefined ? '--' : Number(value).toFixed(1);
    const unit = document.createElement('div');
    unit.className = 'sensor-unit';
    unit.textContent = measurement?.unit ?? (state.sensorType === 'temperature_bag' ? '°C' : '%');
    const bar = document.createElement('div');
    bar.className = 'sensor-bar';
    const fill = document.createElement('i');
    fill.style.width = `${sensorBarPercentage(state.sensorType, value)}%`;
    bar.append(fill);
    tile.append(status, number, valueElement, unit, bar);
    grid.append(tile);
  }
}

function sensorRangeClass(type, value) {
  if (value === null || value === undefined) return '';
  if (type === 'temperature_bag') {
    if (value < 20) return 'is-low';
    if (value > 26) return 'is-high';
  } else {
    if (value < 65) return 'is-low';
    if (value > 85) return 'is-high';
  }
  return '';
}

function sensorStatusClass(status) {
  if (status === 'stale') return 'is-stale';
  if (status === 'no_data' || status === 'disabled') return 'is-no-data';
  return '';
}

function statusLabel(status) {
  return { online: 'Lectura reciente', stale: 'Sin lectura reciente', no_data: 'Sin datos', disabled: 'Deshabilitado' }[status] ?? 'Sin datos';
}

function sensorBarPercentage(type, value) {
  if (value === null || value === undefined) return 0;
  return type === 'temperature_bag'
    ? Math.min(100, Math.max(0, ((value - 18) / 12) * 100))
    : Math.min(100, Math.max(0, value));
}

function renderSelectedBag() {
  const bag = BAGS[state.selectedBag - 1];
  const temperature = latestMeasurement('temperature_bag', state.selectedBag);
  const humidity = latestMeasurement('humidity_bag', state.selectedBag);
  elements['bag-name'].textContent = bag.name;
  elements['bag-species'].textContent = bag.species;
  elements['bag-chart-title'].textContent = bag.name;
  elements['bag-badge'].textContent = bag.badge;
  elements['bag-image'].src = `/images/bags/b${state.selectedBag}.png`;
  elements['bag-image'].alt = `Ilustración de la ${bag.name}`;
  elements['bag-image-bg'].style.background = `radial-gradient(ellipse at center, ${bag.color} 0%, #f8f8fa 70%)`;
  elements['bag-temperature'].textContent = formatMeasurement(temperature, 1);
  elements['bag-humidity'].textContent = formatMeasurement(humidity, 1);
  elements['bag-select'].value = String(state.selectedBag);
}

async function refreshAmbientChart() {
  const requestId = ++state.ambientRequest;
  const config = AMBIENT_TYPES[state.ambientType];
  try {
    const payload = await requestJson(`/api/measurements/history?type=${state.ambientType}&sensorId=0&hours=24&pageSize=500&sort=asc`);
    if (requestId !== state.ambientRequest) return;
    drawLineChart(elements['ambient-chart'], [{ label: config.label, color: config.color, unit: config.unit, data: payload.measurements }]);
    elements['ambient-chart-meta'].textContent = payload.count ? `${payload.count} lecturas · ${config.unit}` : 'Sin datos';
  } catch {
    if (requestId !== state.ambientRequest) return;
    drawLineChart(elements['ambient-chart'], []);
    elements['ambient-chart-meta'].textContent = 'No disponible';
  }
}

async function refreshBagChart() {
  const requestId = ++state.bagRequest;
  const bag = state.selectedBag;
  try {
    const [temperature, humidity] = await Promise.all([
      requestJson(`/api/measurements/history?type=temperature_bag&sensorId=${bag}&bag=${bag}&hours=24&pageSize=500&sort=asc`),
      requestJson(`/api/measurements/history?type=humidity_bag&sensorId=${bag}&bag=${bag}&hours=24&pageSize=500&sort=asc`),
    ]);
    if (requestId !== state.bagRequest) return;
    drawLineChart(elements['bag-chart'], [
      { label: 'Temperatura', color: '#ef6c54', unit: '°C', data: temperature.measurements },
      { label: 'Humedad', color: '#4a90d9', unit: '%', data: humidity.measurements },
    ]);
  } catch {
    if (requestId !== state.bagRequest) return;
    drawLineChart(elements['bag-chart'], []);
  }
}

function drawLineChart(svg, rawSeries) {
  svg.replaceChildren();
  const series = rawSeries
    .map((item) => ({ ...item, data: item.data.filter(({ value, timestamp }) => Number.isFinite(value) && timestamp) }))
    .filter(({ data }) => data.length);
  if (!series.length) {
    const empty = svgElement('text', { x: 400, y: 120, 'text-anchor': 'middle', class: 'chart-empty' });
    empty.textContent = 'Sin historial disponible';
    svg.append(empty);
    return;
  }

  const width = 800;
  const height = 240;
  const padding = { left: 54, right: 54, top: 28, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const allTimestamps = series.flatMap(({ data }) => data.map(({ timestamp }) => new Date(timestamp).getTime()));
  const minimumTime = Math.min(...allTimestamps);
  const maximumTime = Math.max(...allTimestamps);
  const timeSpan = Math.max(1, maximumTime - minimumTime);

  for (let index = 0; index <= 4; index += 1) {
    const y = padding.top + (plotHeight * index) / 4;
    svg.append(svgElement('line', { x1: padding.left, x2: width - padding.right, y1: y, y2: y, class: 'chart-grid' }));
  }

  for (let index = 0; index <= 3; index += 1) {
    const time = minimumTime + (timeSpan * index) / 3;
    const x = padding.left + (plotWidth * index) / 3;
    const label = svgElement('text', { x, y: height - 10, 'text-anchor': index === 0 ? 'start' : index === 3 ? 'end' : 'middle', class: 'chart-axis-label' });
    label.textContent = limaTime.format(new Date(time)).slice(0, 5);
    svg.append(label);
  }

  series.forEach((item, seriesIndex) => {
    const values = item.data.map(({ value }) => value);
    const rawMinimum = Math.min(...values);
    const rawMaximum = Math.max(...values);
    const valueSpan = Math.max(item.unit === 'ppm' ? 20 : 0.5, rawMaximum - rawMinimum);
    const margin = valueSpan * 0.18;
    const minimum = rawMinimum - margin;
    const maximum = rawMaximum + margin;
    const scale = Math.max(0.0001, maximum - minimum);
    const points = item.data.map(({ timestamp, value }) => ({
      x: padding.left + ((new Date(timestamp).getTime() - minimumTime) / timeSpan) * plotWidth,
      y: padding.top + (1 - (value - minimum) / scale) * plotHeight,
    }));
    const linePath = points.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

    if (series.length === 1 && points.length > 1) {
      const areaPath = `${linePath} L ${points.at(-1).x.toFixed(2)} ${padding.top + plotHeight} L ${points[0].x.toFixed(2)} ${padding.top + plotHeight} Z`;
      svg.append(svgElement('path', { d: areaPath, fill: item.color, class: 'chart-area-fill' }));
    }
    svg.append(svgElement('path', { d: linePath, stroke: item.color, class: 'chart-line' }));
    const endpoint = points.at(-1);
    svg.append(svgElement('circle', { cx: endpoint.x, cy: endpoint.y, r: 4, fill: item.color, class: 'chart-endpoint' }));

    const axisX = seriesIndex === 0 ? padding.left - 8 : width - padding.right + 8;
    const anchor = seriesIndex === 0 ? 'end' : 'start';
    const maxLabel = svgElement('text', { x: axisX, y: padding.top + 4, 'text-anchor': anchor, class: 'chart-axis-label' });
    const minLabel = svgElement('text', { x: axisX, y: padding.top + plotHeight, 'text-anchor': anchor, class: 'chart-axis-label' });
    maxLabel.textContent = formatAxisValue(maximum, item.unit);
    minLabel.textContent = formatAxisValue(minimum, item.unit);
    svg.append(maxLabel, minLabel);

    const seriesLabel = svgElement('text', { x: padding.left + seriesIndex * 150, y: 15, fill: item.color, class: 'chart-series-label' });
    seriesLabel.textContent = `${item.label}: ${formatAxisValue(values.at(-1), item.unit)} ${item.unit}`;
    svg.append(seriesLabel);
  });

  svg.setAttribute('aria-label', series.map(({ label, data }) => `${label}, ${data.length} lecturas`).join('; '));
}

function formatAxisValue(value, unit) {
  return unit === 'ppm' ? Math.round(value).toString() : compactNumber.format(value);
}

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, String(value));
  return element;
}

function selectBag(bag) {
  state.selectedBag = Number(bag);
  renderSensorGrid();
  renderSelectedBag();
  void refreshBagChart();
}

async function toggleSimulation() {
  const button = elements['simulation-toggle'];
  if (state.user?.role !== 'admin') {
    toast('Esta acción requiere permisos de administrador', true);
    return;
  }
  button.disabled = true;
  try {
    const action = state.simulatorRunning ? 'stop' : 'start';
    await requestJson(`/api/simulation/${action}`, { method: 'POST' });
    toast(state.simulatorRunning ? 'Simulador detenido' : 'Simulador iniciado');
    await refreshAll();
    await Promise.all([refreshAmbientChart(), refreshBagChart()]);
  } catch (error) {
    if (error.status === 401) handleSessionExpired();
    else toast(error.message, true);
  } finally {
    button.disabled = state.user?.role !== 'admin';
  }
}

async function toggleRelay(relayKey, enabled) {
  const relay = state.control?.relays.find(({ key }) => key === relayKey);
  if (state.user?.role !== 'admin' || !relay || !state.control?.permissions?.canModify) {
    toast('Tu rol no puede modificar los relés', true);
    renderControl();
    return;
  }

  const previousEnabled = relay.enabled;
  relay.enabled = enabled;
  state.controlBusy.add(relayKey);
  renderControl();
  try {
    const payload = await requestJson(`/api/control/${relayKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    state.control = payload.control;
    toast(`${relay.name} · ${enabled ? 'encendido' : 'apagado'}`);
  } catch (error) {
    relay.enabled = previousEnabled;
    if (error.status === 401) handleSessionExpired();
    else toast(error.message, true);
  } finally {
    state.controlBusy.delete(relayKey);
    renderControl();
  }
}

async function refreshAll() {
  if (state.refreshing) return;
  state.refreshing = true;
  try {
    const results = await Promise.allSettled([refreshHealth(), refreshLatest(), refreshControl()]);
    const authenticationFailure = results.find(
      ({ status, reason }) => status === 'rejected' && reason?.status === 401,
    );
    if (authenticationFailure && state.user) {
      handleSessionExpired();
      return;
    }
    if (results.every(({ status }) => status === 'rejected')) throw new Error('No se pudo actualizar el dashboard');
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.refreshing = false;
  }
}

function toast(message, isError = false) {
  const notification = document.createElement('div');
  notification.className = `toast${isError ? ' is-error' : ''}`;
  notification.textContent = message;
  elements['toast-wrap'].append(notification);
  setTimeout(() => notification.remove(), 4_000);
}

function bindEvents() {
  elements['ambient-tabs'].addEventListener('click', (event) => {
    const button = event.target.closest('[data-type]');
    if (!button) return;
    elements['ambient-tabs'].querySelectorAll('.seg-btn').forEach((item) => item.classList.toggle('active', item === button));
    state.ambientType = button.dataset.type;
    void refreshAmbientChart();
  });
  elements['sensor-tabs'].addEventListener('click', (event) => {
    const button = event.target.closest('[data-type]');
    if (!button) return;
    elements['sensor-tabs'].querySelectorAll('.seg-btn').forEach((item) => item.classList.toggle('active', item === button));
    state.sensorType = button.dataset.type;
    renderSensorGrid();
  });
  elements['bag-select'].addEventListener('change', (event) => selectBag(event.target.value));
  elements['simulation-toggle'].addEventListener('click', () => void toggleSimulation());
  elements['auth-toggle'].addEventListener('click', () => {
    if (state.user) void logout();
    else showLogin();
  });
  elements['login-close'].addEventListener('click', hideLogin);
  elements['login-continue'].addEventListener('click', hideLogin);
  elements['auth-overlay'].addEventListener('click', (event) => {
    if (event.target === elements['auth-overlay']) hideLogin();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements['auth-overlay'].hidden) hideLogin();
  });
  elements['login-form'].addEventListener('submit', (event) => void submitLogin(event));
  elements['history-filters'].addEventListener('submit', (event) => {
    event.preventDefault();
    void refreshHistory(1);
  });
  elements['history-export'].addEventListener('click', () => void downloadHistoryCsv());
  elements['history-prev'].addEventListener('click', () => void refreshHistory(state.historyPage - 1));
  elements['history-next'].addEventListener('click', () => void refreshHistory(state.historyPage + 1));
  elements['gallery-prev'].addEventListener('click', () => void refreshGallery(state.photoPage - 1));
  elements['gallery-next'].addEventListener('click', () => void refreshGallery(state.photoPage + 1));
  elements['latest-photo-open'].addEventListener('click', () => openPhoto(state.latestPhoto));
  elements['camera-gallery-link'].addEventListener('click', () => {
    if (!state.user) {
      showLogin('Inicia sesión para ver la galería completa.');
      return;
    }
    elements['photo-gallery-section'].scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!state.photos.length) void refreshGallery(1);
  });
  elements['photo-dialog-close'].addEventListener('click', closePhotoDialog);
  elements['photo-dialog'].addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.id === 'photo-dialog') closePhotoDialog();
  });
  elements['history-type'].addEventListener('change', () => synchronizeHistoryFilters('type'));
  elements['history-sensor'].addEventListener('change', () => synchronizeHistoryFilters('sensor'));
  elements['history-bag'].addEventListener('change', () => synchronizeHistoryFilters('bag'));
  document.querySelectorAll('[data-relay]').forEach((input) => {
    input.addEventListener('change', () => void toggleRelay(input.dataset.relay, input.checked));
  });
}

async function initialize() {
  bindEvents();
  updateClock();
  setHistoryDefaults();
  renderAuthentication();
  renderControl();
  renderHistory();
  renderLatestPhoto();
  renderGallery();
  renderSensorGrid();
  renderSelectedBag();
  drawLineChart(elements['ambient-chart'], []);
  drawLineChart(elements['bag-chart'], []);
  await refreshSession();
  await refreshAll();
  await Promise.all([
    refreshAmbientChart(),
    refreshBagChart(),
    refreshHistory(1),
    refreshLatestPhoto(),
    state.user ? refreshGallery(1) : Promise.resolve(),
  ]);
  setInterval(updateClock, 1_000);
  setInterval(() => void refreshAll(), REFRESH_INTERVAL_MS);
  setInterval(() => {
    void refreshAmbientChart();
    void refreshBagChart();
  }, HISTORY_REFRESH_MS);
  setInterval(() => {
    void refreshLatestPhoto();
    if (state.user) void refreshGallery(state.photoPage);
  }, PHOTO_REFRESH_MS);
}

void initialize();
