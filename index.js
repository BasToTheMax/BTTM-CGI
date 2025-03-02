require('dotenv').config();
const env = process.env;
const { log } = console;

const e = require('express');
const express = require('express');
const fs = require('fs');
const Path = require('path');
const eol = require("eol")
const { spawn } = require('child_process');
const httpHeaders = require('http-headers')
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

        const proc = spawn(filePath, {
            env: {},
            killSignal: 'SIGKILL'
        });
        let data = '';
        let start = Date.now();
        let isEnd = false;
        let timelimit = 10;
        
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