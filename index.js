require('dotenv').config();
const env = process.env;
const { log } = console;

const express = require('express');
const fs = require('fs');
const Path = require('path');
const app = express();

const port = env.port || 3000;

let ext = ['html', 'php', 'js', 'lua', 'py'];
let base = env.BASE  || __dirname + '/data'

app.get('/', (req, res) => {
    res.redirect('/main');
});

app.use('/:user/*', handleTilde);
app.use('/:user', handleTilde);

function handleTilde(req, res, next) {
        let params = req.params;
        let user = params.user;
        let path = params['0'] || 'index';
        res.json({ user, path });
}

app.listen(port, () => {
    log(`Server online at port ${port}!`);
});