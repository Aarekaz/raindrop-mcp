(() => {
  const site = window.RaindropMcpSite;
  if (!site) {
    return;
  }

  document.querySelectorAll('.copy-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.closest('.code-block')?.querySelector('code')?.textContent || '';

      try {
        await navigator.clipboard.writeText(code);
        site.showToast('Copied');
      } catch {
        site.showToast('Copy failed');
      }
    });
  });

  const tocLinks = Array.from(document.querySelectorAll('.toc a'));
  const sections = tocLinks
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  const setActiveSection = (id) => {
    tocLinks.forEach((link) => {
      const active = link.getAttribute('href') === `#${id}`;
      if (active) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  if ('IntersectionObserver' in window && sections.length > 0) {
    const visible = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          visible.set(entry.target.id, entry.intersectionRatio);
        } else {
          visible.delete(entry.target.id);
        }
      });

      if (visible.size === 0) {
        return;
      }

      const activeId = [...visible.entries()].sort((a, b) => b[1] - a[1])[0][0];
      setActiveSection(activeId);
    }, {
      rootMargin: '-18% 0px -58% 0px',
      threshold: [0, 0.2, 0.45, 0.7, 1],
    });

    sections.forEach((section) => observer.observe(section));
  }

  tocLinks.forEach((link) => {
    link.addEventListener('click', () => {
      const id = link.getAttribute('href')?.slice(1);
      if (id) {
        setActiveSection(id);
      }
    });
  });

  site.hydrateFromInfo();
})();
