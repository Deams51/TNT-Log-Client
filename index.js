var server = require('./config').server;
var socket = require('socket.io-client')(server);

socket.on('connect', function(){});
socket.on('event', function(data){});
socket.on('disconnect', function(){});

socket.on('start', start);
socket.on('shutdown', shutdown);
socket.on('restart', restart);
socket.on('sha', sendLastCommitSha);
socket.on('update', update);

function cleanData(data) {
    var res = [];

    // Split lines, using a sync loop to keep order
    var dataArray = data.toString().split(/\r?\n/);
    for(var idx in dataArray) {
        var msg = dataArray[idx];
        if(msg.replace(/\s/g, '').length > 0)
            res.push(msg);
    }

    return res;
}

const spawn = require('child_process').spawn;
const nodePath = process.env.HOME + '/chainpoint-node';


function execLogs() {
    const logs = spawn('docker-compose', ['logs', '-f', '-t'], {cwd: nodePath});

    logs.stdout.on('data', (data) => {
        socket.emit('log', {level: 'info', data: cleanData(data)});
    });

    logs.stderr.on('data', (data) => {
        socket.emit('log', {level: 'info', data: cleanData(data)});
    });

    logs.on('close', (code) => {
        socket.emit('log', {level: 'info', data: ['Exited with code: ' + code]});
        console.log(`child process exited with code ${code}`);
    });
}

function sendLastCommitSha() {
    const lastCommitGit = spawn('git', ['rev-parse', 'HEAD'], {cwd: nodePath});
    lastCommitGit.stdout.on('data', (data) => {
        socket.emit('sha', data.toString());
    });

    lastCommitGit.stderr.on('data', (data) => {
        socket.emit('sha-error', data.toString());
    });
}

function shutdown() {
    const make = spawn('make', ['down'], {cwd: nodePath});
    make.stdout.on('data', (data) => {
        console.log('shutdown: ${data}');
        socket.emit('shutdown-log', {level: 'info', data: cleanData(data)});
    });

    make.stderr.on('data', (data) => {
        console.error('shutdown: ${data}');
        socket.emit('shutdown-error', {level: 'error', data: cleanData(data)});
    });

    make.on('close', (code) => {
        console.log('Exited shutdown with code ' + code);
        socket.emit('shutdown-finished', code);
    });
}

function start() {
    const make = spawn('make', ['up'], {cwd: nodePath});
    make.stdout.on('data', (data) => {
        console.log('start: ${data}');
        socket.emit('start-log', {level: 'info', data: cleanData(data)});
    });

    make.stderr.on('data', (data) => {
        console.error('start: ${data}');
        socket.emit('start-error', {level: 'error', data: cleanData(data)});
    });

    make.on('close', (code) => {
        console.log('Exited start with code ' + code);
        socket.emit('start-finished', code);
    });
}

function update() {
    const git = spawn('git', ['pull'], {cwd: process.env.HOME + '/chainpoint-node'});
    git.stdout.on('data', (data) => {
        console.log('Update: ${data}');
        socket.emit('update-log', {level: 'info', data: cleanData(data)});
    });

    git.stderr.on('data', (data) => {
        console.error('Update: ${data}');
        socket.emit('update-error', {level: 'error', data: cleanData(data)});
    });

    git.on('close', (code) => {
        console.log('Exited update with code ' + code);
        socket.emit('update-finished', code);
    });
}