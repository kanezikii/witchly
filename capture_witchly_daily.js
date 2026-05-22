(() => {
  if (window.__witchlyDailyHookInstalled) {
    console.log("[witchly-daily] hook already installed");
    return;
  }

  window.__witchlyDailyHookInstalled = true;

  const hints = ["daily", "manifest", "ritual", "claim", "coin"];
  const matches = (value) =>
    typeof value === "string" &&
    hints.some((hint) => value.toLowerCase().includes(hint));

  const pretty = (value) => {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const snapshotHeaders = (headersLike) => {
    if (!headersLike) return {};
    try {
      return Object.fromEntries(new Headers(headersLike).entries());
    } catch {
      return {};
    }
  };

  const dump = (type, url, method, headers, body, status, responseText) => {
    if (!matches(url) && !matches(body) && !matches(responseText)) return;
    console.group(`[witchly-daily] ${type} ${method} ${url}`);
    console.log("url:", url);
    console.log("method:", method);
    console.log("headers:", headers);
    console.log("body:", body);
    console.log("status:", status);
    console.log("response:", responseText);
    console.groupEnd();
  };

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const [resource, init] = args;
    const url = typeof resource === "string" ? resource : resource?.url || "";
    const method =
      init?.method ||
      (typeof resource !== "string" ? resource?.method : null) ||
      "GET";
    const headers = {
      ...snapshotHeaders(typeof resource !== "string" ? resource?.headers : null),
      ...snapshotHeaders(init?.headers),
    };
    const body = pretty(init?.body);

    const response = await originalFetch(...args);
    const clone = response.clone();
    let responseText = "";
    try {
      responseText = await clone.text();
    } catch {
      responseText = "<unreadable>";
    }

    dump("fetch", url, method, headers, body, response.status, responseText);
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__witchlyDaily = {
      method,
      url,
      headers: {},
    };
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
    if (this.__witchlyDaily) this.__witchlyDaily.headers[key] = value;
    return originalSetRequestHeader.call(this, key, value);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const meta = this.__witchlyDaily || {
      method: "GET",
      url: "",
      headers: {},
    };
    this.addEventListener("loadend", () => {
      dump(
        "xhr",
        meta.url,
        meta.method,
        meta.headers,
        pretty(body),
        this.status,
        this.responseText || ""
      );
    });
    return originalSend.call(this, body);
  };

  console.log(
    "[witchly-daily] hook installed; click the ritual button and watch Console output"
  );
})();
