const fs = require('fs');
const path = require('path');

// 1. Generate version string based on current date
const now = new Date();
const vMajor = String(now.getFullYear()).charAt(0); // 2
const vMinor = String(now.getFullYear()).slice(-1); // 6
const vPatch = `${now.getMonth() + 1}${String(now.getDate()).padStart(2, '0')}`;
const bHours = String(now.getHours()).padStart(2, '0');
const bMins = String(now.getMinutes()).padStart(2, '0');

const versionString = `v${vMajor}.${vMinor}.${vPatch}-b${bHours}${bMins}`;
console.log(`[NQoS-Tools] Stamping new version: ${versionString}`);

// 2. Identify target files
const targetFiles = [
    path.join(__dirname, 'index.html')
];

// Regex to find and replace the content inside <span id="app-version">...</span>
const versionRegex = /(<span[\s\n]+id="app-version">)(.*?)(<\/span>)/is;

let updatedAny = false;

// 3. Process each file
targetFiles.forEach(targetPath => {
    if (!fs.existsSync(targetPath)) {
        console.warn(`[NQoS-Tools] Warning: Could not find ${targetPath}`);
        return;
    }

    let content = fs.readFileSync(targetPath, 'utf8');

    // Check if the file actually has the target span
    if (versionRegex.test(content)) {
        content = content.replace(versionRegex, `$1${versionString}$3`);
        fs.writeFileSync(targetPath, content, 'utf8');
        updatedAny = true;
        console.log(`[NQoS-Tools] -> Updated ${path.basename(targetPath)}`);
    } else {
        console.warn(`[NQoS-Tools] -> Warning: <span id="app-version"> tag not found in ${path.basename(targetPath)}`);
    }
});

// 4. Exit gracefully
if (!updatedAny) {
    console.warn(`[NQoS-Tools] No version tags were found to update.`);
} else {
    console.log(`[NQoS-Tools] Version update complete.`);
}
