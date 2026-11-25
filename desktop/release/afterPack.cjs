// Signs the Mac app ad hoc once it is packed, before its disk image is made. electron-builder signs only with an
// identity from a keychain; without one it signs nothing, and the app it renamed and gave its own Info.plist keeps
// Electron's signature, which those changes broke. A downloaded app with a broken signature is "damaged and can't be
// opened", with nothing to press; one signed ad hoc is whole, and opens from System Settings, Privacy & Security.
// Where a release holds a developer's identity, electron-builder signs over this afterwards. Other platforms pass by.
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
