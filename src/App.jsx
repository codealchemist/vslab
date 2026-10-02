import { useEffect, useRef, useState } from 'react';
import { ShieldAlert, LoaderCircle, Clock, CloudOff } from 'lucide-react';
import { useApp } from './context.jsx';
import { parseShareHash, downloadShare, resultFingerprint } from './lib/share.js';
import { uid, fmtDate } from './lib/format.js';
import { MAX_FRIENDS } from './lib/storage.js';
import Header from './components/Header.jsx';
import { APP_VERSION } from './version.js';
import { Modal, Toasts } from './components/ui.jsx';
import Overview from './views/Overview.jsx';
import Timeline from './views/Timeline.jsx';
import Compare from './views/Compare.jsx';
import Import from './views/Import.jsx';
import SharedResult from './views/SharedResult.jsx';

const VIEWS = { overview: Overview, timeline: Timeline, compare: Compare, import: Import, shared: SharedResult };

/**
 * Opening a shared link saves the result to the friends list (once: duplicates are recognised)
 * and shows it. If the list is full it is shown without saving, and the view offers to make room.
 */
function useReceiveShare() {
  const { t, friends, setFriends, go, toast } = useApp();
  const latest = useRef(friends);
  latest.current = friends;
  return (share) => {
    const current = latest.current;
    const known = new Map(current.map((f) => [resultFingerprint(f.result), f]));
    // Legacy links could carry several results: save what fits, show the most recent.
    const viewed = share.results.at(-1);
    const fresh = share.results.filter((r) => !known.has(resultFingerprint(r)));
    const room = Math.max(MAX_FRIENDS - current.length, 0);
    const saved = (room ? fresh.slice(-room) : []).map((result) => ({ id: uid(), sharedBy: share.sharedBy, receivedAt: share.receivedAt, result }));
    if (saved.length) {
      setFriends((fs) => [...fs, ...saved]);
      latest.current = [...current, ...saved];
      toast(t('sharedView.saved'));
    }
    const target = known.get(resultFingerprint(viewed)) || saved.find((f) => f.result === viewed);
    if (target) go('shared', { friendId: target.id });
    else go('shared', { share: { sharedBy: share.sharedBy, receivedAt: share.receivedAt, result: viewed } });
  };
}

/** Downloads a hosted share, then shows it (or explains why it can't). */
function LoadingShare({ id }) {
  const { t, closeModal } = useApp();
  const receive = useReceiveShare();
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    downloadShare(id)
      .then((share) => {
        if (cancelled) return;
        closeModal();
        receive(share);
      })
      .catch((e) => !cancelled && setError(e.message === 'expired' ? 'expired' : 'failed'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]);

  return (
    <Modal
      title={error === 'expired' ? t('share.expiredTitle') : error ? t('share.fetchFailedTitle') : t('share.loading')}
      icon={error === 'expired' ? <Clock size={18} className="muted" /> : error ? <CloudOff size={18} className="muted" /> : <LoaderCircle size={18} className="spin muted" />}
      onClose={closeModal}
      footer={
        error && (
          <>
            <button className="btn ghost" onClick={closeModal}>{t('common.close')}</button>
            {error === 'failed' && <button className="btn primary" onClick={() => setAttempt((n) => n + 1)}>{t('share.retry')}</button>}
          </>
        )
      }
    >
      {error === 'expired' && <p>{t('share.expired')}</p>}
      {error === 'failed' && <p>{t('share.fetchFailed')}</p>}
    </Modal>
  );
}

export default function App() {
  const { t, route, modal, openModal, toast } = useApp();
  const View = VIEWS[route.tab] || Overview;
  const receive = useReceiveShare();
  const receiveRef = useRef(receive);
  receiveRef.current = receive;

  useEffect(() => {
    const handle = () => {
      const req = parseShareHash();
      if (!req) return;
      history.replaceState(null, '', location.pathname + location.search);
      if (req.inline) receiveRef.current(req.inline);
      else if (req.hosted) openModal(<LoadingShare id={req.hosted} />);
      else toast(t('share.invalid'), 'error');
    };
    handle();
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Header />
      <main className="shell">
        <View key={route.tab + (route.resultId || route.friendId || '')} />
        <footer className="footer">
          <ShieldAlert size={14} />
          <span className="grow">{t('footer.disclaimer')}</span>
          <span className="version num" title={t('footer.version', { version: APP_VERSION })}>VSLab v{APP_VERSION}</span>
        </footer>
      </main>
      {modal}
      <Toasts />
    </>
  );
}
