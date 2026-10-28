import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './ui/styles.css';
import { ApiPage } from './ui/ApiPage';
import { App } from './ui/App';
import { Gallery } from './ui/Gallery';
import { applyTheme, readTheme } from './ui/theme';

// the saved theme before the first paint, so a dark page never flashes white
applyTheme(readTheme());

// Three pages: the editor, the icon gallery at /gallery, and the AI API docs at /api.
const path = window.location.pathname;
const page = /\/gallery$/.test(path) ? <Gallery /> : /\/api$/.test(path) ? <ApiPage /> : <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page}
  </StrictMode>,
);
