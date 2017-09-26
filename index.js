var config = require('./config');
var socket = require('socket.io-client')(config.server);

/** API **/
socket.on('connect', function(){
    socket.emit('register', {name: config.name});
});

socket.on('event', function(data){});
socket.on('disconnect', function(){});

socket.on('start', start);
socket.on('shutdown', shutdown);
socket.on('restart', restart);
socket.on('sha', sendLastCommitSha);
socket.on('updateIfNeeded', updateIfNeeded);

const spawn = require('child_process').spawn;
const nodePath = process.env.HOME + '/chainpoint-node';

function onLog(data)    { sendLog(data, 'info'); }
function onError(data)  { sendLog(data, 'error'); }

function sendLog(data, level) {
    var cleaned = cleanData(data);
    for (var i = 0, len = cleaned.length; i < len; i++) {
        console.log(cleaned[i]);
        console.log('type: ' + toType(cleaned[i]));
        socket.emit('log', {level: level, data: cleaned[i]});
    }
}

var toType = function(obj) {
    return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
}

function execLogs() {
    const logs = spawn('docker-compose', ['logs', '-f', '-t'], {cwd: nodePath});
    logs.stdout.on('data', onLog);
    logs.stderr.on('data', onError);

    logs.on('close', (code) => {
        const level = (code !== 0 ? 'error' : 'info');
        socket.emit('log', {level: level, data: ['Exited with code: ' + code]});
        console.log(`Logs process exited with code ${code}`);
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

    getLastCommitSha().then(localSha => {
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

/**
 * Convert input buffer to string, split on new lines and remove unicode characters
 * @param buffer
 * @returns {Array} cleaned strings
 */
function cleanData(buffer) {
    const res = [];
    // Split lines, using a sync loop to keep order
    const dataArray = buffer.toString().split(/\r?\n/);
    for (var i = 0, len = dataArray.length; i < len; i++) {
        var msg = dataArray[i];
        // Check if string is empty
        if(msg.replace(/\s/g, '').length > 0) {
            // Remove unicode characters and push to results
            var cleanedLine = msg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').replace(/\r?\n|\r/g, '');
            res.push(cleanedLine);
        }
    }
    return res;
}
