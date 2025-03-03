require('dotenv').config();
const env = process.env;
const { log } = console;

const express = require('express');
const fs = require('fs');
const Path = require('path');
const eol = require("eol")
const { spawn } = require('child_process');
const httpHeaders = require('http-headers');
const Url = require('url');
const e = require('express');
const app = express();

const port = env.port || 3000;

let exts = ['html', 'cgi', 'sh', 'php', 'js', 'lua', 'py'];
let static = ['html'];
let base = env.BASE || __dirname + '/data';
let home = env.USERHOME || __dirname + '/data';
let maxduration = env.TIMEOUT || 10;
maxduration = maxduration * 1000; // to milliseconds

app.get('/', (req, res) => {
    res.redirect('/main');
});

app.get('/favicon.ico', (req, res) => res.status(404).send());

app.use('/:user', handleTilde);
app.use('/:user/*', handleTilde);

function handleTilde(req, res, next) {
    let params = req.params;
    let user = params.user;
    let path = params['0'] || '';

    let fsPath = Path.join(base, user, path);
    let info = Path.parse(path);

    if (fs.existsSync(fsPath)) {
        let extFile = String(info.ext);
        if (extFile != '') {
            extFile = extFile.replace('.', '');
            if (exts.includes(extFile) == false) {
                return res.sendFile(fsPath);
            }
        }
    }

    let fsAltPath = Path.join(base, user, path, 'index');
    let paths = [];

    paths.push(fsPath);
    paths.push(`${fsAltPath}.html`);
    for (let i = 0; i < exts.length; i++) {
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

    console.log(path);

    info = Path.parse(filePath);
    let extFile = String(info.ext);
    if (extFile != '') {
        extFile = extFile.replace('.', '');
        if (static.includes(extFile) == true) {
            return res.sendFile(filePath);
        }
    }

    let procEnv = {};
    procEnv['CONTENT_LENGTH'] = req.body?.length || "";
    procEnv['CONTENT_TYPE'] = req.header('content-type') || "";
    procEnv['GATEWAY_INTERFACE'] = 'CGI/1.1';
    procEnv['PATH_INFO'] = path;
    procEnv['PATH_TRANSLATED'] = filePath;

    // Query params
    var i = req.originalUrl.indexOf('?');
    let query = '';
    if (i !== -1) {
        query = '?' + req.originalUrl.substr(i + 1);
    }
    procEnv['QUERY_STRING'] = query;

    procEnv['REMOTE_ADDR'] = '127.0.0.1';
    procEnv['REMOTE_HOST'] = 'localhost';
    procEnv['REQUEST_METHOD'] = req.method;
    procEnv['SCRIPT_NAME'] = path;
    procEnv['SERVER_NAME'] = '288255.xyz';
    procEnv['SERVER_PORT'] = 80;
    procEnv['SERVER_PROTOCOL'] = 'HTTP/1.0';
    procEnv['SERVER_SOFTWARE'] = 'TILDE288255_CUSTOM/1.0';

    let chrootPath = filePath;
    chrootPath = chrootPath.replace(base, home);

    let suArgs = [user, '-s', '/bin/bash', '-c', chrootPath];

    let cwd = Path.dirname(chrootPath);
    const proc = spawn('su', suArgs, {
        killSignal: 'SIGKILL',
        shell: '/bin/bash',
        env: procEnv,
        cwd
    });

    let data = '';
    let start = Date.now();
    let isEnd = false;
    let isError = false;

    setTimeout(() => {
        proc.kill('SIGKILL');
        if (isEnd == false) {
            res.header('X-time', maxduration);
            isEnd = true;
            return res.status(504).type('txt').send(`Timeout reached of ${maxduration} ms`);
        }
    }, maxduration);

    proc.stdout.on('data', (d) => {
        console.log('Data');
        data += d;
        // console.log(`stdout: ${d}`);
    });

    proc.on('spawn', () => {
        console.log('Spawn');
        proc.stdin.write(String(req.body || ""));
    });

    proc.stderr.on('data', (d) => {
        console.error(`stderr: ${d}`);
        isError = true;
        data += d;
    });

    proc.on('close', (code) => {
        console.log('close');
        let end = Date.now();
        if (isEnd == false) {
            isEnd = true;
            res.header('X-time', end - start);

            if (isError == false) {
                // Handle normal output
                let status = 200;
                d = data;
                d = String(d);
                d = eol.lf(d);

                let spl = splitOutput(d);

                if (!spl) {
                    return res.status(500).type('txt').send(`Invalid output!`);
                }

                let headers = spl[0];
                headers = httpHeaders(headers);

                // Check for required headers
                if (!headers['content-type']) return res.status(500).type('txt').send(`Output does not contain content-type header!`);
                if (!headers['status']) return res.status(500).type('txt').send(`Output does not contain status header!`);

                // Loop trough headers
                for (var key in headers) {
                    if (key == 'status') {
                        // Update status
                        status = parseInt(headers[key]);
                        if (isNaN(status)) return res.status(500).type('txt').send(`Status header is not a valid number!`);
                    } else {
                        // Set header
                        res.header(key, headers[key]);
                    }
                }

                // Send reponse
                res.status(status);
                res.send(spl[1]);
            } else {
                // Error
                res.status(500).type('txt').send(data);
            }
        }
    });

    proc.on('error', (data) => {
        console.log('error', data);
        isEnd = true;
        let end = Date.now();
        res.header('X-time', end - start);
        res.status(500).type('txt').send(String(data));
        console.error(`stderr: ${data}`);
        proc.kill();
    });

    // res.json({ user, path, fsPath, fsAltPath, info });
}

function findPaths(paths) {
    // log(`Checking ${paths.length} paths!`);
    for (let i = 0; i < paths.length; i++) {
        let newPath = paths[i];
        // log(`Trying ${newPath}`);
        if (fs.existsSync(newPath)) {
            let isFile = fs.lstatSync(newPath).isFile();
            if (isFile == true) return newPath;
            // log(`Found ${newPath}`, isFile); 
        }
    }

    return null;
}

app.listen(port, () => {
    log(`Server online at port ${port}!`);
});

function splitOutput(output) {
    let index = output.indexOf(Buffer.from([0x0a, 0x0a]));

    if (index === -1) {
        return null;
    }

    const first = output.slice(0, index);
    const second = output.slice(index + 2);

    return [first, second];
}