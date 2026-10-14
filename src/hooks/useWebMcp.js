import { useEffect, useRef } from 'react';
import { useApp } from '../context.jsx';
import { MAX_RESULTS } from '../lib/storage.js';
import { createTools, registerTools } from '../lib/webmcp.js';

/**
 * Registers the WebMCP tools once. Tools read the latest state through a ref, so they never go stale.
 * Titles use the language the page loaded in: re-registering on a language switch could collide with
 * the old names if the browser drops aborted tools asynchronously, leaving no tools at all.
 */
export function useWebMcp() {
  const { t, results, friends, settings, standard, sex, sexFromReport, setStagedImport, setWebmcp, go } = useApp();
  const state = useRef(null);
  state.current = {
    results,
    friends,
    standard: standard.id,
    sex,
    sexSource: settings.sex ? 'setting' : sexFromReport ? 'report' : 'default',
    maxResults: MAX_RESULTS,
  };
  const actions = useRef(null);
  actions.current = { setStagedImport, go };

  useEffect(() => {
    // Created up front so cleanup can unregister even while registration is still running
    // (StrictMode mounts twice; the second run must not collide with the first's names).
    const controller = new AbortController();
    const tools = createTools({
      getState: () => state.current,
      stage: (parsed) => {
        actions.current.setStagedImport(parsed);
        actions.current.go('import');
      },
      titleFor: (name) => t(`webmcp.tools.${name}`, { defaultValue: '' }),
    });
    registerTools(tools, { controller }).then((status) => {
      if (!status.aborted) setWebmcp({ supported: status.supported, registered: status.registered, error: status.error });
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
