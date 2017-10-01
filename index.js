"use strict";

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

function onLogData(data)    { sendLog(data, 'info'); }
function onErrorData(data)  { sendLog(data, 'error'); }
function OnLogLine(line)  { socket.emit('log', {level: 'info', data: line}); }
function onErrorLine(line)  { socket.emit('log', {level: 'error', data: line}); }

function sendLog(data, level) {
    var cleaned = cleanData(data);
    for (var i = 0, len = cleaned.length; i < len; i++) {
        socket.emit('log', {level: level, data: cleaned[i]});
    }
}

function execLogs() {
    const logs = spawn('docker-compose', ['logs', '-f', '-t'], {cwd: nodePath});
    logs.stdout.on('data', onLogData);
    logs.stderr.on('data', onErrorData);

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
        .catch(err => onErrorData(err))
}

function shutdown() {
    const make = spawn('make', ['down'], {cwd: nodePath});

    return new Promise((resolve, reject) => {
        make.stdout.on('data', onLogData);
        make.stderr.on('data', onErrorData);

        make.on('close', (code) => {
            console.log('Exited shutdown with code ' + code);
            socket.emit('shutdown-finished', code);
            resolve();
        });
    });
}

function start() {
    return new Promise((resolve, reject) => {
        const make = spawn('make', ['up'], {cwd: nodePath});
        make.stdout.on('data', onLogData);
        make.stderr.on('data', onErrorData);

        make.on('close', (code) => {
            console.log('Exited start with code ' + code);
            socket.emit('start-finished', code);

            if (code === 0) {
                execLogs();
            }
            resolve();
        });
    });
}

function updateIfNeeded(lastSha) {
    if(!lastSha) return onErrorLine('updateIfNeeded: No sha sent');

    getLastCommitSha().then(localSha => {
        if(localSha !== lastSha) {
            OnLogLine('Updating node...');

            const make = spawn('make', ['upgrade'], {cwd: nodePath});
            make.stdout.on('data', onLogData);
            make.stderr.on('data', onErrorData);

            make.on('close', (code) => {
                console.log('Exited upgrade with code ' + code);
                socket.emit('upgrade-finished', code);
                OnLogLine('Update finished with code: ' + code);

                if (code === 0) {
                    execLogs();
                }
            });

        }
        else {
            OnLogLine('Already up to date!');
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


let request = require('request-promise');
const repoUrl = 'https://api.github.com/repos/chainpoint/chainpoint-node/commits/master';
async function getLatestCommitHash() {
  try {
    let options = {
      url: repoUrl,
      headers: {
        'User-Agent': 'TNT-logs'
      }
    };

    let res = await request(options);
    let commit = JSON.parse(res);
    let lastCommitSha = commit.sha;
    console.log('SHA: ' + lastCommitSha);
    return lastCommitSha;
  }
  catch(err) {
    console.error(err);
  }
}


function checkForUpdate() {
    OnLogLine('Checking for update...');
    getLatestCommitHash().then(latestSha => {
        updateIfNeeded(latestSha);
    }).catch(err => {
        onErrorLine('Failed to get latest sha from Github: ' + err);
    });
}


checkForUpdate();

setInterval(checkForUpdate, 1000*60*10);