var server = require('./config').server;
var socket = require('socket.io-client')(server);

socket.on('connect', function(){});
socket.on('event', function(data){});
socket.on('disconnect', function(){});

socket.on('start', start);
socket.on('shutdown', shutdown);
socket.on('restart', restart);
socket.on('sha', sendLastCommitSha);
socket.on('updateIfNeeded', updateIfNeeded);

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

function onLog(data)    { socket.emit('log', {level: 'info', data: cleanData(data)}); }
function onError(data)  { socket.emit('log', {level: 'error', data: cleanData(data)}); }

function execLogs() {
    const logs = spawn('docker-compose', ['logs', '-f', '-t'], {cwd: nodePath});
    logs.stdout.on('data', onLog);
    logs.stderr.on('data', onError);

    logs.on('close', (code) => {
        socket.emit('log', {level: 'info', data: ['Exited with code: ' + code]});
        console.log(`child process exited with code ${code}`);
    });
}


function getLastCommitSha() {
    return new Promise((resolve, reject) => {
        const git = spawn('git', ['rev-parse', 'HEAD'], {cwd: nodePath});

        var res = '';
        var err = '';

        git.stdout.on('data', (data) => {
            res += data;
        });

        git.stderr.on('data', (data) => {
            err += data;
        });

        git.on('close', (code) => {
            if(code === 0) {
                resolve(res.toString());
            }
            else reject(err);
        });
    });
}


function sendLastCommitSha() {
    // const lastCommitGit = spawn('git', ['rev-parse', 'HEAD'], {cwd: nodePath});
    // lastCommitGit.stdout.on('data', (data) => {
    //     socket.emit('sha', data.toString());
    // });
    //
    // lastCommitGit.stderr.on('data', (data) => {
    //     socket.emit('sha-error', data.toString());
    // });

    getLastCommitSha
        .then(sha => socket.emit('sha', sha))
        .catch(err => onError(err))
}

function shutdown() {
    const make = spawn('make', ['down'], {cwd: nodePath});
    make.stdout.on('data', onLog);
    make.stderr.on('data', onError);

    make.on('close', (code) => {
        console.log('Exited shutdown with code ' + code);
        socket.emit('shutdown-finished', code);
    });
}

function start() {
    const make = spawn('make', ['up'], {cwd: nodePath});
    make.stdout.on('data', onLog);
    make.stderr.on('data', onError);

    make.on('close', (code) => {
        console.log('Exited start with code ' + code);
        socket.emit('start-finished', code);

        if(code === 0) {
            execLogs();
        }
    });
}


function updateIfNeeded(lastSha) {
    if(!lastSha) return console.error('updateIfNeeded: No sha sent');

    getLastCommitSha.then(localSha => {
        if(localSha !== lastSha) {
            const git = spawn('git', ['pull'], {cwd: process.env.HOME + '/chainpoint-node'});
            git.stdout.on('data', onLog);
            git.stderr.on('data', onError);

            git.on('close', (code) => {
                console.log('Exited update with code ' + code);
                socket.emit('update-finished', code);
            });
        }
    });
}

function restart(){

}