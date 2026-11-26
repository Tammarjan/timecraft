import { registerPlugin } from '@capacitor/core';

window.TimeCraftNativeApp = true;
window.TimeCraftDirectSms = registerPlugin('DirectSms');
await import('./app.js');
