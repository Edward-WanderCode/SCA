const fs = require('fs');
const path = 'D:\\Code\\SCA\\src\\app\\api\\history\\route.ts';

try {
    const stats = fs.lstatSync(path);
    console.log('Is directory:', stats.isDirectory());
    console.log('Is file:', stats.isFile());
    console.log('Is symbolic link:', stats.isSymbolicLink());

    if (stats.isSymbolicLink()) {
        console.log('Link target:', fs.readlinkSync(path));
    } else {
        console.log('Not a symbolic link, attempting readlink anyway...');
        try {
            fs.readlinkSync(path);
        } catch (e) {
            console.log('readlink failed as expected:', e.code, e.message);
        }
    }
} catch (e) {
    console.error('Error:', e);
}
