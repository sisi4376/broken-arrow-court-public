import { createReader } from './reader.mjs';

window.COURT_READONLY = true;
window.COURT_READONLY_API = createReader(new URL('../../', import.meta.url));
await import('./app.js');
