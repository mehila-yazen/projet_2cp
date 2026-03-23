(function (global) {
  function parseJsonSafe(text) {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (_err) {
      return null;
    }
  }

  function buildError(status, payload, fallbackMessage) {
    var detail = payload && (payload.detail || payload.message || payload.error);
    return new Error(detail || fallbackMessage || ('Request failed (' + status + ')'));
  }

  function ApiClient(options) {
    var opts = options || {};
    var configuredBase = opts.baseUrl || global.__API_BASE_URL || '';
    this.baseUrl = configuredBase.replace(/\/$/, '');
  }

  ApiClient.prototype._buildUrl = function (path) {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    if (!this.baseUrl) {
      return path;
    }

    return this.baseUrl + path;
  };

  ApiClient.prototype._request = async function (path, config) {
    var response = await fetch(this._buildUrl(path), config || {});
    var text = await response.text();
    var payload = parseJsonSafe(text);

    if (!response.ok) {
      throw buildError(response.status, payload, 'Backend request failed');
    }

    return payload || {};
  };

  ApiClient.prototype.health = async function () {
    return this._request('/health');
  };

  ApiClient.prototype.extractPdf = async function (file) {
    var formData = new FormData();
    formData.append('file', file);

    return this._request('/extract/pdf', {
      method: 'POST',
      body: formData,
    });
  };

  ApiClient.prototype.extractPdfs = async function (files) {
    var formData = new FormData();

    files.forEach(function (file) {
      formData.append('files', file);
    });

    return this._request('/extract/pdfs', {
      method: 'POST',
      body: formData,
    });
  };

  ApiClient.prototype.getCompletedExtractions = async function (limit) {
    var query = typeof limit === 'number' ? ('?limit=' + encodeURIComponent(limit)) : '';
    return this._request('/extract/completed' + query);
  };

  global.DigitizationApiClient = ApiClient;
})(window);
