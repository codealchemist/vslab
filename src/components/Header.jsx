import { LayoutDashboard, ChartLine, Swords, Upload, Settings, Sun, Moon, Monitor, Check, ChevronDown, Scale, Download, Trash2, Languages, FlaskConical, Info, Link2 } from 'lucide-react';
import { useApp } from '../context.jsx';
import { STANDARDS, stdShort } from '../data/standards.js';
import { downloadFile } from '../lib/export.js';
import { appUrl } from '../lib/share.js';
import { copyText } from '../lib/clipboard.js';
import { LANGS } from '../i18n/index.js';
import { APP_VERSION } from '../version.js';
import { Menu, useConfirm } from './ui.jsx';
import { useInfo } from './info.jsx';

export const TABS = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'timeline', icon: ChartLine },
  { id: 'compare', icon: Swords },
  { id: 'import', icon: Upload },
];

function StandardMenu() {
  const { t, lang, standard, updateSettings } = useApp();
  const info = useInfo();
  return (
    <Menu
      button={({ toggle }) => (
        <button className="btn sm std-btn" onClick={toggle} title={t('standard.label')}>
          <Scale size={14} />
          <span>{standard.short}</span>
          <ChevronDown size={13} />
        </button>
      )}
    >
      {(close) => (
        <div style={{ width: 320 }}>
          <div className="menu-label row between">
            {t('standard.label')}
            <button className="icon-btn sm" onClick={() => { close(); info.allStandards(); }} aria-label={t('common.explain')}>
              <Info size={14} />
            </button>
          </div>
          {STANDARDS.map((s) => (
            <button
              key={s.id}
              className={`menu-item std-item ${s.id === standard.id ? 'active' : ''}`}
              onClick={() => {
                updateSettings({ standard: s.id });
                close();
              }}
            >
              {s.id === standard.id ? <Check size={16} /> : <span style={{ width: 16 }} />}
              <span className="grow">
                {stdShort(s, lang)}
                <small>{s.org[lang] || s.org.en}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </Menu>
  );
}

function SettingsMenu() {
  const { t, settings, updateSettings, results, friends, setResults, setFriends, toast, sex, sexFromReport, username } = useApp();
  const confirm = useConfirm();
  const themes = [
    { id: 'light', icon: Sun },
    { id: 'dark', icon: Moon },
    { id: 'system', icon: Monitor },
  ];
  return (
    <Menu
      button={({ toggle }) => (
        <button className="icon-btn" onClick={toggle} aria-label={t('settings.title')} title={t('settings.title')}>
          <Settings size={18} />
        </button>
      )}
    >
      {(close) => (
        <div style={{ width: 270 }}>
          <div className="menu-label">{t('settings.theme')}</div>
          <div style={{ padding: '2px 6px 6px' }}>
            <div className="segmented" style={{ width: '100%' }}>
              {themes.map((x) => (
                <button key={x.id} className={settings.theme === x.id ? 'active' : ''} style={{ flex: 1 }} onClick={() => updateSettings({ theme: x.id })}>
                  <x.icon size={13} /> {t(`settings.${x.id}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="menu-label">{t('settings.username')}</div>
          <div style={{ padding: '2px 6px 6px' }}>
            <input
              className="input"
              style={{ height: 34 }}
              maxLength={24}
              defaultValue={username}
              placeholder={t('settings.usernamePlaceholder')}
              onChange={(e) => updateSettings({ username: e.target.value })}
              aria-label={t('settings.username')}
            />
            <p className="tiny muted" style={{ marginTop: 4 }}>{t('settings.usernameHint')}</p>
          </div>
          <div className="menu-label">{t('settings.sex')}</div>
          <div style={{ padding: '2px 6px 6px' }}>
            <div className="segmented" style={{ width: '100%' }}>
              {['male', 'female'].map((s) => (
                <button key={s} className={sex === s ? 'active' : ''} style={{ flex: 1 }} onClick={() => updateSettings({ sex: s })}>
                  {t(`detail.${s}`)}
                </button>
              ))}
            </div>
            {sexFromReport && <p className="tiny muted" style={{ marginTop: 4 }}>{t('settings.sexDetected')}</p>}
          </div>
          <div className="menu-sep" />
          <div className="menu-label">{t('settings.shareApp')}</div>
          {LANGS.map((l) => (
            <button
              key={l}
              className="menu-item"
              onClick={async () => {
                close();
                try {
                  await copyText(appUrl(l));
                  toast(t('toast.linkCopied'));
                } catch {
                  toast(t('toast.copyFailed'), 'error');
                }
              }}
            >
              <Link2 size={16} /> {t('settings.copyAppLink')} · {t(`lang.${l}`)}
            </button>
          ))}
          <div className="menu-sep" />
          <div className="menu-label">{t('settings.data')}</div>
          <button
            className="menu-item"
            onClick={() => {
              close();
              downloadFile(`vslab-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'VSLab', version: 1, results, friends }, null, 2), 'application/json');
            }}
          >
            <Download size={16} /> {t('settings.backup')}
          </button>
          <button
            className="menu-item"
            style={{ color: 'var(--crit)' }}
            onClick={() => {
              close();
              confirm(t('settings.wipeConfirm'), () => {
                setResults([]);
                setFriends([]);
                toast(t('toast.wiped'));
              });
            }}
          >
            <Trash2 size={16} style={{ color: 'var(--crit)' }} /> {t('settings.wipe')}
          </button>
          <p className="tiny muted" style={{ padding: '6px 10px 4px' }}>{t('settings.storageNote')}</p>
          <p className="tiny muted num" style={{ padding: '0 10px 4px' }}>{t('footer.version', { version: APP_VERSION })}</p>
        </div>
      )}
    </Menu>
  );
}

export default function Header() {
  const { t, lang, setLang, route, go } = useApp();
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <button className="brand" onClick={() => go('overview')}>
            <span className="brand-mark"><FlaskConical size={17} strokeWidth={2.2} /></span>
            <span style={{ textAlign: 'left' }}>
              VSLab
              <small>{t('app.tagline')}</small>
            </span>
          </button>
          <nav className="nav" aria-label="Main">
            {TABS.map((tab) => (
              <button key={tab.id} className={route.tab === tab.id ? 'active' : ''} onClick={() => go(tab.id)}>
                <tab.icon size={15} /> {t(`nav.${tab.id}`)}
              </button>
            ))}
          </nav>
          <div className="header-tools">
            <StandardMenu />
            <button
              className="btn sm ghost"
              onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
              title={t('settings.language')}
              aria-label={t('settings.language')}
            >
              <Languages size={15} /> {lang === 'es' ? 'ES' : 'EN'}
            </button>
            <SettingsMenu />
          </div>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Main">
        {TABS.map((tab) => (
          <button key={tab.id} className={route.tab === tab.id ? 'active' : ''} onClick={() => go(tab.id)}>
            <tab.icon size={20} />
            {t(`nav.${tab.id}`)}
          </button>
        ))}
      </nav>
    </>
  );
}
