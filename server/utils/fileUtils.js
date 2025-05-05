const fs = require('fs');
const path = require('path');

// Secure file write to prevent path traversal
function secureWriteFile(filePath, data) {
    const normalizedPath = path.normalize(filePath);
    const absolutePath = path.resolve(normalizedPath);
    const baseDir = path.resolve('.');
    if (!absolutePath.startsWith(baseDir)) {
        throw new Error(`Security error: Attempted to write to file outside of application directory: ${filePath}`);
    }
    fs.writeFileSync(absolutePath, data);
    return true;
}

// Secure file read to prevent path traversal
function secureReadFile(filePath) {
    const normalizedPath = path.normalize(filePath);
    const absolutePath = path.resolve(normalizedPath);
    const baseDir = path.resolve('.');
    if (!absolutePath.startsWith(baseDir)) {
        throw new Error(`Security error: Attempted to read file outside of application directory: ${filePath}`);
    }
    return fs.readFileSync(absolutePath, 'utf8');
}

function updateStoredKeys(keys) {
    // Write to keys.json file
    secureWriteFile('./Json/keys.json', JSON.stringify(keys, null, 2));
    return true;
}

module.exports = {
    secureWriteFile,
    secureReadFile,
    updateStoredKeys
}; 