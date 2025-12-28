const fs = require('fs');
const path = 'node_modules/react-native-track-player/lib/module/NativeTrackPlayer.web.js';

if (fs.existsSync(path)) {
    let content = fs.readFileSync(path, 'utf8');
    let modified = false;

    // Check for deeply nested broken path (current error): ../../../web -> ../../web
    if (content.includes("require('../../../web')")) {
        console.log('Fixing corrupted NativeTrackPlayer.web.js (found ../../../web)...');
        content = content.replace("require('../../../web')", "require('../../web')");
        modified = true;
    }

    // Check for original incomplete path: ../web -> ../../web
    // Use a regex to match EXACTLY require('../web') to avoid matching require('../../web')
    const originalBugRegex = /require\(['"]\.\.\/web['"]\)/;
    if (originalBugRegex.test(content)) {
        console.log('Patching NativeTrackPlayer.web.js (fixing ../web)...');
        content = content.replace(originalBugRegex, "require('../../web')");
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(path, content);
        console.log('File updated successfully.');
    } else {
        console.log('File is already correct.');
    }
} else {
    console.error('File not found: ' + path);
}
