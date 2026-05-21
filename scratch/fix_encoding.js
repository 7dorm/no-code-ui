const buf = Buffer.from('РђР»СЊС‚РµСЂРЅР°С‚РёРІРЅР°СЏ', 'latin1');
const decoder = new TextDecoder('windows-1251');
// let's try converting from string to bytes by reversing the wrong decoding
function fixString(str) {
  // Try mapping each char to its char code and treat as bytes
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return new TextDecoder('utf8').decode(bytes);
}

function fixString2(str) {
  // Maybe it was decoded from utf8 as cp1251?
  // Let's encode back to cp1251 bytes
  const bytes = [];
  // Node doesn't have a built in encoder for cp1251. 
}

console.log("Method 1:", fixString('РђР»СЊС‚РµСЂРЅР°С‚РёРІРЅР°СЏ'));

// Actually let's just do iconv-lite. Let's see if it's installed.
