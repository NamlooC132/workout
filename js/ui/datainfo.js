// "Where is my data?" – one short explanation of how workouts are stored and how to keep them safe.
import { h } from '../vdom.js';
import { icon } from './icons.js';
import { data, closeSheet, saveSettings } from '../store.js';
import { Sheet, Button } from './components.js';
import { exportFile } from './settings.js';

const RISKS = [
  ['trash', 'You delete the app icon from your home screen'],
  ['x', 'You clear website data in Safari / Chrome settings'],
  ['swap', 'You switch to a new phone, or lose this one'],
];

// sheet: { type: 'dataInfo' }
export function DataInfoSheet() {
  const s = data.settings;
  const seen = () => { if (!s.dataInfoSeen) saveSettings({ dataInfoSeen: true }); };
  return h(Sheet, { title: 'Your data', onClose: () => { seen(); closeSheet(); } }, [
    h('div.di-lead', 'Your workouts are saved on this phone only – no account, no cloud. Updates never erase them.'),
    h('div.di-h', 'You lose them if:'),
    h('div.di-risks', RISKS.map(([ic, t]) => h('div.di-risk', { key: ic }, [icon(ic, 18), h('span', t)]))),
    h('div.di-h', 'To keep them safe:'),
    h('div.di-text', 'Tap Back up now and save the file to iCloud, Google Drive or WhatsApp. On a new phone: Settings → Import data.'),
    s.lastBackupAt && h('div.small.muted', { style: { marginTop: '6px' } }, `Last backup: ${new Date(s.lastBackupAt).toLocaleDateString()}`),
    h('div.di-actions', [
      h(Button, { block: true, onClick: () => { seen(); exportFile('full'); closeSheet(); } }, [icon('download', 18), 'Back up now']),
      h(Button, { block: true, kind: 'plain', onClick: () => { seen(); closeSheet(); } }, 'Got it'),
    ]),
  ]);
}
