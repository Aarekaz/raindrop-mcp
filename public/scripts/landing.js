(() => {
  const site = window.RaindropMcpSite;
  if (!site) {
    return;
  }

  let endpoint = site.DEFAULT_ENDPOINT;

  const installDialog = document.getElementById('install-dialog');

  document.querySelectorAll('[data-open-install]').forEach((button) => {
    button.addEventListener('click', () => installDialog?.showModal());
  });

  document.querySelector('[data-close-install]')?.addEventListener('click', () => {
    installDialog?.close();
  });

  document.querySelectorAll('[data-copy-url]').forEach((button) => {
    button.addEventListener('click', async () => {
      const url = button.dataset.copyUrl || endpoint;

      try {
        await navigator.clipboard.writeText(url);
        button.dataset.copied = 'true';
        site.showToast('Endpoint copied');
        window.setTimeout(() => {
          delete button.dataset.copied;
        }, 1500);
      } catch {
        site.showToast('Copy failed');
      }
    });
  });

  document.querySelectorAll('[role="tab"][data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      document.querySelectorAll('[role="tab"][data-tab]').forEach((candidate) => {
        candidate.setAttribute('aria-selected', String(candidate === tab));
      });

      document.querySelectorAll('[role="tabpanel"]').forEach((panel) => {
        panel.hidden = panel.id !== `tab-${target}`;
      });
    });
  });

  document.querySelectorAll('.copy-snippet').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.parentElement?.querySelector('code')?.textContent?.trim() || '';

      try {
        await navigator.clipboard.writeText(code);
        site.showToast('Copied');
      } catch {
        site.showToast('Copy failed');
      }
    });
  });

  site.hydrateFromInfo().then((result) => {
    endpoint = result.endpoint;
  });
})();
