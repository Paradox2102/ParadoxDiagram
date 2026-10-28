import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './ui/styles.css';
import { App } from './ui/App';
import { Gallery } from './ui/Gallery';

// Two pages: the editor, and the icon gallery at /gallery.
const gallery = /\/gallery$/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {gallery ? <Gallery /> : <App />}
  </StrictMode>,
);
