import fs from 'fs';
const text = 'РђР»СЊС‚РµСЂРЅР°С‚РёРІРЅР°СЏ';
console.log(Buffer.from(text).toString('hex'));

// Let's use python to figure out the encoding, it's easier.
