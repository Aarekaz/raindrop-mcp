(() => {
  const DEFAULT_ENDPOINT = `${window.location.origin}/mcp`;

  function fixFileProtocolLinks() {
    if (window.location.protocol !== 'file:') {
      return;
    }

    document.querySelectorAll('[data-file-href]').forEach((link) => {
      link.setAttribute('href', link.dataset.fileHref);
    });
  }

  function getToast() {
    return document.querySelector('.toast');
  }

  function showToast(message) {
    const toast = getToast();
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.dataset.show = 'true';
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.dataset.show = 'false';
    }, 1400);
  }

  function endpointFromInfo(info) {
    return info?.links?.mcpServer || DEFAULT_ENDPOINT;
  }

  function endpointLabel(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  async function loadInfo() {
    try {
      const response = await fetch('/info', {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  function applyEndpoint(root, endpoint) {
    root.querySelectorAll('[data-server-endpoint]').forEach((element) => {
      if (element instanceof HTMLAnchorElement) {
        element.href = endpoint;
        return;
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = endpoint;
        return;
      }

      element.textContent = endpoint;
    });

    root.querySelectorAll('[data-server-endpoint-label]').forEach((element) => {
      element.textContent = endpointLabel(endpoint);
    });

    root.querySelectorAll('[data-copy-url]').forEach((element) => {
      element.dataset.copyUrl = endpoint;
    });
  }

  function applyStats(root, info, endpoint) {
    const toolCount = info?.stats?.toolsAvailable;
    if (typeof toolCount === 'number') {
      root.querySelectorAll('[data-server-tool-count]').forEach((element) => {
        element.textContent = String(toolCount);
      });

      root.querySelectorAll('[data-server-tool-count-label]').forEach((element) => {
        element.textContent = `${toolCount} MCP tools`;
      });
    }

    if (info?.version) {
      root.querySelectorAll('[data-server-version]').forEach((element) => {
        element.textContent = info.version;
      });
    }

    if (info?.status) {
      root.querySelectorAll('[data-server-status]').forEach((element) => {
        element.textContent = info.status;
      });
    }

    if (info?.links?.website) {
      try {
        const website = new URL(info.links.website);
        const host = website.host;
        root.querySelectorAll('[data-server-host]').forEach((element) => {
          element.textContent = host;
        });

        root.querySelectorAll('[data-server-curl]').forEach((element) => {
          const path = element.dataset.serverCurl || '';
          element.textContent = `curl ${website.origin}${path}`;
        });
      } catch {
        // Ignore invalid website URLs from /info.
      }
    }

    root.querySelectorAll('[data-server-endpoint-inline]').forEach((element) => {
      element.textContent = endpoint;
    });
  }

  function buildSnippets(endpoint) {
    return {
      claude: `{
  "mcpServers": {
    "raindrop": {
      "url": "${endpoint}",
      "transport": "streamable-http"
    }
  }
}`,
      cursor: `{
  "mcpServers": {
    "raindrop": {
      "url": "${endpoint}",
      "transport": "streamable-http"
    }
  }
}`,
      codex: `codex mcp add raindrop ${endpoint}`,
      generic: `{
  "name": "raindrop",
  "url": "${endpoint}",
  "transport": "streamable-http"
}`,
    };
  }

  function applySnippets(root, endpoint) {
    const snippets = buildSnippets(endpoint);

    root.querySelectorAll('[data-snippet]').forEach((element) => {
      const key = element.dataset.snippet;
      if (!key || !(key in snippets)) {
        return;
      }

      const code = element.querySelector('code');
      if (code) {
        code.textContent = snippets[key];
      }
    });
  }

  async function hydrateFromInfo(root = document) {
    const info = await loadInfo();
    const endpoint = endpointFromInfo(info);

    applyEndpoint(root, endpoint);
    applySnippets(root, endpoint);

    if (info) {
      applyStats(root, info, endpoint);
    }

    return { info, endpoint };
  }

  window.RaindropMcpSite = {
    DEFAULT_ENDPOINT,
    fixFileProtocolLinks,
    showToast,
    loadInfo,
    endpointFromInfo,
    endpointLabel,
    buildSnippets,
    hydrateFromInfo,
    applyEndpoint,
    applySnippets,
    applyStats,
  };

  fixFileProtocolLinks();
})();
