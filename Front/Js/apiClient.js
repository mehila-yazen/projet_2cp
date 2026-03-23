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
    var storedBase = '';
    try {
      storedBase = (global.localStorage && global.localStorage.getItem('apiBaseUrl')) || '';
    } catch (_err) {
      storedBase = '';
    }

    var configuredBase = opts.baseUrl || global.__API_BASE_URL || storedBase || 'http://127.0.0.1:8000';
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

  ApiClient.prototype.extractPdf = async function (file, operationId) {
    var formData = new FormData();
    formData.append('file', file);
    if (operationId) {
      formData.append('operation_id', operationId);
    }

    return this._request('/extract/pdf', {
      method: 'POST',
      body: formData,
    });
  };

  ApiClient.prototype.extractPdfs = async function (files, operationId) {
    var formData = new FormData();

    files.forEach(function (file) {
      formData.append('files', file);
    });
    if (operationId) {
      formData.append('operation_id', operationId);
    }

    return this._request('/extract/pdfs', {
      method: 'POST',
      body: formData,
    });
  };

  ApiClient.prototype.getCompletedExtractions = async function (limit) {
    var query = typeof limit === 'number' ? ('?limit=' + encodeURIComponent(limit)) : '';
    return this._request('/extract/completed' + query);
  };

  ApiClient.prototype.getExtractionProgress = async function (operationId) {
    return this._request('/extract/progress/' + encodeURIComponent(operationId));
  };

  ApiClient.prototype.saveVerifiedStudents = async function (payload) {
    return this._request('/verify/students/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload || {}),
    });
  };

  global.DigitizationApiClient = ApiClient;
})(window);
