(function initArchiveApiClient(global) {
  const STORAGE_BASE_URL_KEY = 'apiBaseUrl';
  const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';

  function normalizeBaseUrl(url) {
    return (url || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  function getBaseUrl() {
    return normalizeBaseUrl(global.localStorage.getItem(STORAGE_BASE_URL_KEY) || DEFAULT_BASE_URL);
  }

  function setBaseUrl(url) {
    const normalized = normalizeBaseUrl(url);
    global.localStorage.setItem(STORAGE_BASE_URL_KEY, normalized);
    return normalized;
  }

  async function request(path, options) {
    const response = await fetch(getBaseUrl() + path, options || {});
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || ('Request failed: ' + response.status));
    }
    return response.json();
  }

  async function health() {
    return request('/health', { method: 'GET' });
  }

  async function extractPdfs(files) {
    const formData = new FormData();
    (files || []).forEach(file => formData.append('files', file));
    return request('/extract/pdfs', { method: 'POST', body: formData });
  }

  async function extractPdf(file) {
    const formData = new FormData();
    formData.append('file', file);
    return request('/extract/pdf', { method: 'POST', body: formData });
  }

  async function getCompletedExtractions(limit) {
    const query = typeof limit === 'number' ? ('?limit=' + encodeURIComponent(limit)) : '';
    return request('/extract/completed' + query, { method: 'GET' });
  }

  global.ArchiveApiClient = {
    getBaseUrl,
    setBaseUrl,
    health,
    extractPdf,
    extractPdfs,
    getCompletedExtractions
  };
})(window);
