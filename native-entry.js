import { registerPlugin } from '@capacitor/core';

window.TimeCraftNativeApp = true;
document.getElementById('apkPoster')?.setAttribute('hidden', '');
window.TimeCraftDirectSms = registerPlugin('DirectSms');
await import('./app.js');
