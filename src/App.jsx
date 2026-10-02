import { useEffect, useState } from 'react';
import { Users, ShieldAlert, LoaderCircle, Clock, CloudOff } from 'lucide-react';
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

const VIEWS = { overview: Overview, timeline: Timeline, compare: Compare, import: Import };

function ReceivedShare({ share }) {
  const { t, lang, friends, setFriends, closeModal, go, toast } = useApp();
  // Results already in the friends list (same date, lab and values) are not saved twice.
  const known = new Map(friends.map((f) => [resultFingerprint(f.result), f]));
  const dupeOf = (r) => known.get(resultFingerprint(r));
  const fresh = share.results.filter((r) => !dupeOf(r));
  const dupes = share.results.length - fresh.length;
  const room = MAX_FRIENDS - friends.length;
  // When the list can't take everything, keep the most recent results.
  const toSave = fresh.slice(-Math.max(room, 0));
  const many = share.results.length > 1;

  const save = () => {
    const saved = toSave.map((result) => ({ id: uid(), sharedBy: share.sharedBy, receivedAt: share.receivedAt, result }));
    setFriends((fs) => [...fs, ...saved]);
    toast(t('toast.friendSaved', { count: saved.length }));
    closeModal();
    go('compare', { opponent: `f:${saved.at(-1).id}` });
  };
  const openExisting = () => {
    closeModal();
    go('compare', { opponent: `f:${dupeOf(share.results.at(-1)).id}` });
  };

  return (
    <Modal
      title={share.sharedBy ? t('share.receivedTitle', { name: share.sharedBy, count: share.results.length }) : t('share.receivedAnon', { count: share.results.length })}
      icon={<span className="empty-icon" style={{ width: 36, height: 36, borderRadius: 12 }}><Users size={18} /></span>}
      onClose={closeModal}
      footer={
        <>
          <button className="btn ghost" onClick={closeModal}>{t('share.dismiss')}</button>
          {fresh.length ? (
            <button className="btn primary" onClick={save} disabled={room <= 0}>{t('share.save')}</button>
          ) : (
            <button className="btn primary" onClick={openExisting}>{t('share.openCompare')}</button>
          )}
        </>
      }
    >
      {many ? (
        <>
          <p>{t('share.receivedBodyMany', { count: share.results.length })}</p>
          <ul className="share-list">
            {share.results.map((r) => (
              <li key={r.id}>
                <b>{fmtDate(r.date, lang)}</b>
                <span className="muted small"> · {r.lab || '—'} · {t('overview.markers', { count: r.results.length })}</span>
                {dupeOf(r) && <span className="badge" style={{ marginLeft: 6 }}>{t('share.alreadySaved')}</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{t('share.receivedBody', { date: fmtDate(share.results[0].date, lang), count: share.results[0].results.length })}</p>
      )}
      {!fresh.length && <div className="notice small">{t('share.allSaved', { count: share.results.length })}</div>}
      {fresh.length > 0 && dupes > 0 && <div className="notice small">{t('share.someSaved', { count: dupes })}</div>}
      {fresh.length > 0 && room <= 0 && <div className="notice error small">{t('share.friendsFull', { max: MAX_FRIENDS })}</div>}
      {room > 0 && room < fresh.length && (
        <div className="notice warn small">{t('share.partialSave', { n: room, max: MAX_FRIENDS })}</div>
      )}
    </Modal>
  );
}

/** Downloads a hosted share, then hands over to ReceivedShare (or explains why it can't). */
function LoadingShare({ id }) {
  const { t, openModal, closeModal } = useApp();
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    downloadShare(id)
      .then((share) => !cancelled && openModal(<ReceivedShare share={share} />))
      .catch((e) => !cancelled && setError(e.message === 'expired' ? 'expired' : 'failed'));
    return () => {
      cancelled = true;
    };
  }, [id, attempt, openModal]);

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

  useEffect(() => {
    const handle = () => {
      const req = parseShareHash();
      if (!req) return;
      history.replaceState(null, '', location.pathname + location.search);
      if (req.inline) openModal(<ReceivedShare share={req.inline} />);
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
        <View key={route.tab + (route.resultId || '')} />
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
