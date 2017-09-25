var server = require('./config').server;
var socket = require('socket.io-client')(server);

socket.on('connect', function(){});
socket.on('event', function(data){});
socket.on('disconnect', function(){});

socket.on('start', function() {
    execLogs();
});

socket.on('sha', function() {
    sendLastCommitSha();
});

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


function execLogs() {
    const spawn = require('child_process').spawn;
    const logs = spawn('docker-compose', ['logs', '-f', '-t'], {cwd: process.env.HOME + '/chainpoint-node'});

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
    const spawn = require('child_process').spawn;
    const lastCommitGit = spawn('git', ['rev-parse', 'HEAD'], {cwd: process.env.HOME + '/chainpoint-node'});
    lastCommitGit.stdout.on('data', (data) => {
        socket.emit('sha', data.toString());
    });

    lastCommitGit.stderr.on('data', (data) => {
        socket.emit('sha-error', data.toString());
    });
}

function update() {
    console.log('Update requested...');
    const spawn = require('child_process').spawn;
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