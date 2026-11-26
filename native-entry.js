import { registerPlugin } from '@capacitor/core';

window.TimeCraftDirectSms = registerPlugin('DirectSms');
await import('./app.js');
