import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KEYS, useStored } from './lib/storage.js';
import { STANDARD_MAP, stdShort } from './data/standards.js';

const AppContext = createContext(null);

// sex: null until the user picks one; until then it follows the latest report.
const DEFAULT_SETTINGS = { standard: 'longevity', theme: 'system', sex: null, username: '' };

const isSex = (s) => s === 'male' || s === 'female';

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

export function AppProvider({ children }) {
  const { t, i18n } = useTranslation();
  const [results, setResults] = useStored(KEYS.results, []);
  const [friends, setFriends] = useStored(KEYS.friends, []);
  const [stored, setSettings] = useStored(KEYS.settings, DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const [route, setRoute] = useState({ tab: 'overview' });
  // Opponent ('f:<id>') someone wanted to compare against before they had a result of their own;
  // Import continues to that comparison once a result is added.
  const [pendingCompare, setPendingCompare] = useState(null);

  const systemDark = useSystemDark();
  const theme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toast = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setToasts((ts) => [...ts, { id, message, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3200);
  }, []);

  const updateSettings = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), [setSettings]);

  const sortedResults = useMemo(() => [...results].sort((a, b) => a.date.localeCompare(b.date)), [results]);
  const reportSex = sortedResults.findLast((r) => isSex(r.patient?.sex))?.patient.sex || null;
  const sex = isSex(settings.sex) ? settings.sex : reportSex || 'male';
  // Older versions stored the share name separately.
  const username = (stored.username ?? stored.shareName ?? '').trim();

  const lang = i18n.resolvedLanguage || 'en';
  const rawStandard = STANDARD_MAP[settings.standard] || STANDARD_MAP.longevity;
  // short is resolved to the current language so views can render standard.short directly.
  const localizedStandard = { ...rawStandard, short: stdShort(rawStandard, lang) };

  const value = {
    t,
    lang,
    setLang: (l) => i18n.changeLanguage(l),
    results: sortedResults,
    setResults,
    friends,
    setFriends,
    settings,
    updateSettings,
    standard: localizedStandard,
    sex,
    sexFromReport: !isSex(settings.sex) && !!reportSex,
    sexOverride: sex,
    username,
    theme,
    toast,
    toasts,
    modal,
    openModal: setModal,
    closeModal: () => setModal(null),
    route,
    pendingCompare,
    setPendingCompare,
    go: (tab, params = {}) => {
      setRoute({ tab, ...params });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
