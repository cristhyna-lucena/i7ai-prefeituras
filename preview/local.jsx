// Local development host. The production entry point remains supplied by SGDM.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, AppLayout, Button, Select, Sidebar, ToastProvider } from '@sgdm/design';
import { Shield } from 'lucide-react';
import '@sgdm/design/tokens.css';
import '@sgdm/design/print.css';
import '../src/styles.css';
import '../src/sgdm-theme.css';
import '../src/features.css';
import { App, moduleNavigationGroups } from '../src/app-shell';
import { getSgdmContext } from '../src/integration/sgdmBridge';
import { hasPermission } from '../src/api/permissions';
import { useApi } from '../src/hooks/useApi';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) {
  throw new Error('Acesso disponível somente no ambiente local de desenvolvimento.');
}

const pages = new Set(moduleNavigationGroups.flatMap(([, items]) => items.map(([id]) => id)));
const route = () => {
  const page = location.hash.replace(/^#\//, '');
  return pages.has(page) ? page : 'dashboard';
};
const initialPage = route();
window.__SGDM_CONTEXT__ = { ...getSgdmContext(), modulePage: initialPage, navigationManagedByHost: true };
function LocalHost() {
  const [active, setActive] = useState(initialPage);
  const [token, setToken] = useState(window.__SGDM_CONTEXT__.accessToken || '');
  const session = useApi(token ? '/auth/me' : null, token, null);
  const availableGroups = moduleNavigationGroups.map(([label, items]) => [label,
    items.filter(([id]) => token && hasPermission(session.data?.permissions || [], {
      knowledge: 'knowledge-bases', chat: 'agents', integrations: 'tools', reports: 'reports',
    }[id] || id, 'read')),
  ]).filter(([, items]) => items.length);
  const sections = availableGroups.map(([label, items]) => ({ label,
    items: items.map(([id, title, icon]) => ({ href: '#/' + id, label: title, icon, exact: true })),
  }));
  function update(page, notifyModule, pushHistory = true) {
    if (!pages.has(page)) return;
    window.__SGDM_CONTEXT__.modulePage = page;
    setActive(page);
    if (pushHistory && location.hash !== '#/' + page) history.pushState(null, '', '#/' + page);
    if (notifyModule) window.dispatchEvent(new Event('sgdm:context-updated'));
  }
  function endSession() {
    window.__SGDM_CONTEXT__.accessToken = '';
    sessionStorage.removeItem('sgdm-access-token');
    sessionStorage.removeItem('sgdm-context');
    setToken('');
    window.dispatchEvent(new Event('sgdm:context-updated'));
  }
  useEffect(() => {
    if (!location.hash) history.replaceState(null, '', '#/' + initialPage);
    const sync = event => update(event.detail?.page, false);
    const restore = () => update(route(), true, false);
    window.addEventListener('i7ai:navigate', sync);
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => {
      window.removeEventListener('i7ai:navigate', sync);
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', restore);
    };
  }, []);
  return <ToastProvider><AppLayout
    sidebar={<Sidebar brand={{ name: 'SGDM', subtitle: 'Gestão Documental Municipal', icon: <Shield /> }}
      sections={sections} currentPath={'#/' + active} onNavigate={href => update(href.slice(2), true)}
      onLogout={endSession} label="Menu do SGDM" />}
    header={null}>
    <div className="page-content">
      <div className="preview-mobile-navigation"><div className="form-stack"><Select label="Área do i7Ai" value={active}
        onChange={event => update(event.target.value, true)}>{availableGroups.map(([label, items]) =>
          <optgroup key={label} label={label}>{items.map(([id, title]) =>
            <option key={id} value={id}>{title}</option>)}</optgroup>)}</Select>
        <Button variant="secondary" onClick={endSession}>Sair</Button></div></div>
      <Alert tone="info">Ambiente local de desenvolvimento. Os dados e alterações pertencem a este projeto.</Alert>
      <App />
    </div>
  </AppLayout></ToastProvider>;
}

createRoot(document.getElementById('root')).render(<LocalHost />);
