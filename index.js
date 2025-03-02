require('dotenv').config();
const env = process.env;
const { log } = console;

const e = require('express');
const express = require('express');
const fs = require('fs');
const Path = require('path');
const app = express();

const port = env.port || 3000;

let exts = ['html', 'php', 'js', 'lua', 'py'];
let base = env.BASE  || __dirname + '/data'

app.get('/', (req, res) => {
    res.redirect('/main');
});

app.get('/favicon.ico', (req, res) => res.status(404).send());

app.use('/:user/*', handleTilde);
app.use('/:user', handleTilde);

function handleTilde(req, res, next) {
        let params = req.params;
        let user = params.user;
        let path = params['0'] || '';

        let fsPath = Path.join(base, user, path);
        let fsAltPath = Path.join(base, user, path, 'index');

        let info = Path.parse(path);
        let paths = [];

        paths.push(fsPath);
        for(let i = 0; i < exts.length; i++) {
            paths.push(`${fsAltPath}.${exts[i]}`);
        }

        let filePath = findPaths(paths);
        if (filePath == null) {
            let errpath = Path.join(base, user, '404.html');
            let path404 = findPaths([errpath]);
            res.status(404);
            if (!path404) {
                return res.send();
            } else {
                return res.sendFile(path404);
            }
        }

        res.json({ user, path, fsPath, fsAltPath, info });
}

function findPaths(paths) {
    log(`Checking ${paths.length} paths!`);
    for(let i = 0; i < paths.length; i++) {
        let newPath = paths[i];
        log(`Trying ${newPath}`);
        if (fs.existsSync(newPath)) {
            let isFile = fs.lstatSync(newPath).isFile();
            if (isFile == true) return newPath;
            log(`Found ${newPath}`, isFile); 
        }
    }

    return null;
}

app.listen(port, () => {
    log(`Server online at port ${port}!`);
});