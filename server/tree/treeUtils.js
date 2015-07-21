var Promise = require('bluebird');
var _ = require('underscore');
var Repo = require('../db/models/repo');
var Github = require('github-api');

var request = require('request');
var rp = require('request-promise');

var accessToken;
var setAccessToken = function(token) {
  accessToken = token;
};
var getInitialTreeFromGithub = Promise.promisify(function(commitSha, params, callback) {
  console.log('trying to go to github for tree for commit ', commitSha);
  debugger;
  var options = { url: 'https://api.github.com/repos/' + params.repoFullName + '/git/trees/' + commitSha, headers: { 'User-Agent': 'http://developer.github.com/v3/#user-agent-required' }, qs: {recursive: 1, per_page: 100} };
  if (params.accessToken) options.qs.accessToken = params.accessToken; //TODO code repeated in commits, refactor to auth
  rp(options)
  .then(function(body) {
    var tree = JSON.parse(body);
    debugger;
    if (tree.truncated || !tree.tree) return callback('truncated or no tree', null);
    callback(null, tree);
  }).catch(function(err) {
    callback(err, null);
  });
});

module.exports = {
  setAccessToken: setAccessToken,
  getInitialTreeFromGithub: getInitialTreeFromGithub };
