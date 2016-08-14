'use strict';

var commandExists = require('command-exists');
var Promise = require("bluebird");

function checkDependencies(command) {
  return new Promise(function(resolve, reject){
    commandExists(command, function(error, commandExists){
      if (error) {
        reject(command);
      } else {
        resolve(commandExists)
      }
    });
  });
}

module.exports = checkDependencies;
