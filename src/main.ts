import './styles.css';
import * as A from './app/store';
import { h, replace } from './ui/dom';
import { mountDetailsPanel } from './ui/detailsPanel';
import { openHelp } from './ui/help';
import { mountControlPanels } from './ui/leftPanel';
import { mountResultsPanel } from './ui/resultsPanel';

const app = document.getElementById('app')!;
const splash = document.getElementById('splash')!;
const splashStatus = document.getElementById('splash-status')!;

function header(): HTMLElement {
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('img', { class: 'logo', src: `${import.meta.env.BASE_URL}logo.png`, alt: '', width: '32', height: '32' }), h('h1', { class: 'brand-name' }, 'PRISM')),
    h('span', { class: 'tagline' }, 'Pattern Recognition and Investigation of Shared Matches'),
    h('button', { class: 'help', 'aria-label': 'How it works', title: 'How it works', onclick: openHelp }, '?'));
}

function build() {
  const headerHost = h('div');
  const corpus = h('section', { class: 'panel panel-corpus', 'aria-label': 'Corpus selection' });
  const analysis = h('section', { class: 'panel panel-analysis', 'aria-label': 'Analysis configuration' });
  const centre = h('section', { class: 'panel panel-centre', 'aria-label': 'Shared patterns' });
  const right = h('aside', { class: 'panel panel-right', 'aria-label': 'Pattern details' });
  const workspace = h('main', { class: 'workspace' },
    h('div', { class: 'hero' },
      h('p', { class: 'hero-sub' }, 'Compare datasets, uncover recurring structures, and explore language in context.')),
    h('div', { class: 'controls' }, corpus, analysis),
    h('div', { class: 'grid' }, centre, right));
  const footer = h('footer', { class: 'footer' }, h('span', null, 'PRISM v0.2 · prototype'), h('span', null, 'Synthetic corpora are test data, not genuine findings'));

  replace(app, headerHost, workspace, footer);
  A.onRender('header', () => { replace(headerHost, header()); });
  mountControlPanels(corpus, analysis);
  mountResultsPanel(centre);
  mountDetailsPanel(right);
}

async function start() {
  build();
  A.render();
  try {
    splashStatus.textContent = 'Loading built-in corpora…';
    await A.init();
    splash.classList.add('done');
    setTimeout(() => splash.remove(), 400);
  } catch (e) {
    splashStatus.textContent = `Could not load the corpora: ${(e as Error).message}`;
    splash.classList.add('failed');
  }
  A.render();
}

start();
