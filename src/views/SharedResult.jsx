import { Swords, Trash2, Upload, Users, Replace } from 'lucide-react';
import { useApp } from '../context.jsx';
import { MAX_FRIENDS } from '../lib/storage.js';
import { uid } from '../lib/format.js';
import { Modal, useConfirm } from '../components/ui.jsx';
import ResultDetail from './ResultDetail.jsx';

/** Asked when someone wants to compare but has no lab result of their own yet. */
function NeedOwnResult({ name, opponent }) {
  const { t, closeModal, go, setPendingCompare } = useApp();
  return (
    <Modal
      title={t('sharedView.needOwnTitle')}
      icon={<span className="empty-icon" style={{ width: 36, height: 36, borderRadius: 12 }}><Swords size={18} /></span>}
      onClose={closeModal}
      footer={
        <>
          <button className="btn ghost" onClick={closeModal}>{t('common.cancel')}</button>
          <button
            className="btn primary"
            onClick={() => {
              setPendingCompare(opponent);
              closeModal();
              go('import');
            }}
          >
            <Upload size={15} /> {t('sharedView.importMine')}
          </button>
        </>
      }
    >
      <p>{name ? t('sharedView.needOwnBody', { name }) : t('sharedView.needOwnBodyAnon')}</p>
    </Modal>
  );
}

/**
 * Default view for a lab result someone shared: read-only detail page.
 * route.friendId → a result saved in the friends list; route.share → viewed but not saved (list was full).
 */
export default function SharedResult() {
  const { t, route, friends, setFriends, results, go, toast, openModal } = useApp();
  const confirm = useConfirm();
  const friend = route.friendId && friends.find((f) => f.id === route.friendId);
  const entry = friend || route.share;

  if (!entry) {
    return (
      <div className="card empty fade-in" style={{ marginTop: 32 }}>
        <div className="empty-icon"><Users size={30} /></div>
        <h2>{t('sharedView.gone')}</h2>
        <button className="btn primary" onClick={() => go('overview')}>{t('common.back')}</button>
      </div>
    );
  }

  const name = entry.sharedBy;
  const opponent = friend && `f:${friend.id}`;

  const compare = () => {
    if (!results.length) return openModal(<NeedOwnResult name={name} opponent={opponent} />);
    go('compare', { opponent });
  };

  // Only reachable when the list is full: make room by dropping the oldest friend result.
  const replaceOldest = () => {
    const saved = { id: uid(), sharedBy: entry.sharedBy, receivedAt: entry.receivedAt, result: entry.result };
    setFriends((fs) => [...fs.slice(1), saved]);
    toast(t('sharedView.saved'));
    go('shared', { friendId: saved.id });
  };

  const actions = (
    <>
      <button className="btn primary" onClick={compare} disabled={!friend}>
        <Swords size={15} /> {t('sharedView.compare')}
      </button>
      {friend && (
        <button
          className="btn ghost danger"
          onClick={() =>
            confirm(t('sharedView.removeConfirm'), () => {
              setFriends((fs) => fs.filter((f) => f.id !== friend.id));
              go('overview');
            })
          }
        >
          <Trash2 size={15} /> {t('sharedView.remove')}
        </button>
      )}
    </>
  );

  const notice = !friend && (
    <div className="notice warn" style={{ marginBottom: 16, alignItems: 'center' }}>
      <Users size={16} />
      <span className="grow small">{t('sharedView.notSaved', { max: MAX_FRIENDS })}</span>
      <button className="btn sm" onClick={replaceOldest}>
        <Replace size={14} /> {t('sharedView.replaceOldest')}
      </button>
    </div>
  );

  return <ResultDetail result={entry.result} shared={{ by: name, actions, notice }} />;
}
