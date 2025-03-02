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

        let procEnv = {};
        procEnv['CONTENT_LENGTH'] = req.body?.length;
        procEnv['CONTENT_TYPE'] = req.header('content-type');
        procEnv['GATEWAY_INTERFACE'] = 'CGI/1.1';
        procEnv['PATH_INFO'] = path;
        procEnv['PATH_TRANSLATED'] = filePath;

        // Query params
        var i = req.originalUrl.indexOf('?');
        let query = '';
        if (i !== -1) {
            query = '?' + req.originalUrl.substr(i+1);
        }
        console.log(query);
        procEnv['QUERY_STRING'] = query;

        procEnv['REMOTE_ADDR'] = '127.0.0.1';
        procEnv['REMOTE_HOST'] = 'localhost';
        procEnv['REQUEST_METHOD'] = req.method;
        procEnv['SCRIPT_NAME'] = path;
        procEnv['SERVER_NAME'] = '288255.xyz';
        procEnv['SERVER_PORT'] = 80;
        procEnv['SERVER_PROTOCOL'] = 'HTTP/1.0';
        procEnv['SERVER_SOFTWARE'] = 'TILDE288255_CUSTOM/1.0'

        const proc = spawn(`bwrap --bind /srv/tilde --unshare-all --bind /srv/tilde/home/${user} /home/${user} --uid $(id -u ${user}) --gid $(id -g ${user}) ${filePath}`, {
            env: procEnv,
            killSignal: 'SIGKILL',
            shell: '/bin/bash'
        });
        let data = '';
        let start = Date.now();
        let isEnd = false;
        let timelimit = 60 * 1000;
        
        setTimeout(() => {
            proc.kill('SIGKILL');
            if (isEnd == false) {
                res.header('X-time', timelimit);
                isEnd = true;
                return res.status(504).type('txt').send(`Timeout reached of ${timelimit} ms`);
            }
        }, timelimit);

        proc.stdout.on('data', (d) => {
            data += d;
            // console.log(`stdout: ${d}`);
        });
          
        proc.stderr.on('data', (data) => {
            if (isEnd == true) return;
            isEnd = true;
            let end = Date.now();
            res.header('X-time', end-start);
            res.status(500).type('txt').send(String(data));
            console.error(`stderr: ${data}`);
            proc.kill();
        });
          
        proc.on('close', (code) => {
            let end = Date.now();
            if (isEnd == false) {
                isEnd = true;
                res.header('X-time', end-start);

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
            }
        });

        proc.on('error', (data) => {
            isEnd = true;
            let end = Date.now();
            res.header('X-time', end-start);
            res.status(500).type('txt').send(String(data));
            console.error(`stderr: ${data}`);
            proc.kill();
        });

        // res.json({ user, path, fsPath, fsAltPath, info });
}

function findPaths(paths) {
    // log(`Checking ${paths.length} paths!`);
    for(let i = 0; i < paths.length; i++) {
        let newPath = paths[i];
        // log(`Trying ${newPath}`);
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

function splitOutput(output) {
    let index = output.indexOf(Buffer.from([0x0a, 0x0a]));
  
    if (index === -1) {
      return null;
    }
  
    const first = output.slice(0, index);
    const second = output.slice(index + 2);
  
    return [first, second];
  }