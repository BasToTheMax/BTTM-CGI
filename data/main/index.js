#!/home/codespace/nvm/current/bin/node
console.log("Status: 200");
console.log("Content-Type: text/plain");
console.log();
console.log(`Hello world @ ${Date.now()}`);
console.log(JSON.stringify(process.env, null, 4))