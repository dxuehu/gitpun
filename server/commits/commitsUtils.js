var Promise = require('bluebird');
var db = require('../db/config');
var fs = require('fs');
//var $ = require('jquery');
var _ = require('underscore');
var Commit = require('../db/models/commit');
var Tree = require('../db/models/tree');
//var Commits = require('../db/collections/commits');
var Repo = require('../db/models/repo');
var Github = require('github-api');
var treeUtils = require('../tree/treeUtils');

var request = require('request');
var rp = require('request-promise');

var accessToken;
var setAccessToken = function(token) {
  accessToken = token;
};
//(function getAccessToken() {
  //if (accessToken) return;
  //fs.readFile('client/secret.json', function(err, data) {
    //data = JSON.parse(data.toString());
    ////console.log('data: ', data);
    //accessToken = data.github_token;
  //});
//})();

//var github = new Github({token: access_token, auth: 'oauth'});
//var repo = github.getRepo(repoOwner, repoName);
//
var getCommitsAndTreeFromDb = Promise.promisify(function(repoFullName, callback) {
  new Repo({
    fullName : repoFullName
  }).fetch().then(function(dbRepo) {
    if (!dbRepo) {
      var msg = 'could not find db commits of repo: ' + repoFullName;
      callback(msg, null);
      return console.error(msg);
    }
    dbRepo.commits().fetch().then(function(dbCommits) {
      var formattedCommits = _.pluck(dbCommits.models, 'attributes');
      debugger;
      dbCommits[0].tree().fetch()
      .then(function(tree) {
        debugger;
        console.log('found repo commits in db, returning ', formattedCommits.length, ' commits and the tree');
        callback(null, {commits: formattedCommits, tree: tree.model.attributes});
      });
      //new Commit({sha: formattedCommits[0].sha}).tree().model.attributes
      //callback(null, {commits: formattedCommits, tree: formattedTree});
    });
  })
  .catch(function(error) {
    console.log('error fetching db repo: ', error);
    callback(error, null);
  });
});

var addCommitsToRepo = function(dbRepo, commits, callback) { //helper for saveCommitsToDb
  if (!dbRepo) {
    var msg = 'could not save db commits';
    console.error(msg);
    return callback(msg, null);
  }
  console.log('saved or got existing db repo');
  var repoCommits = dbRepo.commits();
  if (!repoCommits) return console.error('repo ', repoFullName, ' has no commits relationship. wtf');
  console.log('# commits in addCommitsToRepo: ', commits.length);
  callback(null, commits); //give caller immediately so don't have to wait for them to finish storing
  commits.forEach(function(commit) { //the general /commits only has very general info. we must then get the detailed info for each commit later
    repoCommits.create(commit);
  });
};
var saveCommitsToDb = Promise.promisify(function(repoFullName, commits, callback) {
  console.log('begin saving repo: ', repoFullName, ' to db');
  console.log('and saving commits to db');
  new Repo({
    fullName: repoFullName
  }).fetch().then(function(dbRepo) {
    if (dbRepo) { //repo exists in db
      addCommitsToRepo(dbRepo, commits, callback);
    } else { //make new repo
      new Repo({
        fullName: repoFullName
      }).save()
      .then(function(dbRepo) {
        addCommitsToRepo(dbRepo, commits, callback);
      });
    }
  });
});
//var cleanCommitsOverview = function(commits) {
  //if (commits === null) return;
  //var committer;
  //return _.map(commits, function(commit) {
    //committer = (commit.committer && commit.committer.login) || (commit.author && commit.author.login) || commit.commit.committer.name;
    //return {sha: commit.sha, committer: committer, date: commit.commit.committer.date}; //omg
  //});
//};
var getShas = function(commits) {
  if (commits === null) return;
  return _.pluck(commits, 'sha');
};
var cleanCommitsDetailed = function(commits) {
  if (commits === null) return;
  return _.map(commits, function(commit) {
    commit = JSON.parse(commit);
    committer = (commit.committer && commit.committer.login) || (commit.author && commit.author.login) || commit.commit.committer.name;
    return {sha: commit.sha, committer: committer, date: commit.commit.committer.date, files: JSON.stringify(commit.files)}; //omg
  });
};

var visitEachCommit = function(shas, options) { //visit each commit, update commits array with more info about each commit
  var generalUrl = options.url;
  var commitsDetailed = _.map(shas, function(sha) {
    options.url = generalUrl + sha;
    //return rp(options);//rp is request-promise, function(error, response, commitDetailed) {
    return rp(options);
    //.then(function(commit) {
      //console.log('rp commit: ', commit);
    //});
  });
  //console.log('pomirses: ', commitsDetailed);
  return Promise.all(commitsDetailed);
};
var getCommitsAndTreeFromGithub = Promise.promisify(function(repoFullName, callback) {
  console.log('trying to go to github');
  //var localLastCommitTime = Date.now(), pulledLastCommitTime, githubCommits = [];
  var options = { url: 'https://api.github.com/repos/' + repoFullName + '/commits', headers: { 'User-Agent': 'http://developer.github.com/v3/#user-agent-required' }, qs: {access_token: accessToken, per_page: 100} };
  //page param also avail for pagination
  request(options, function(error, response, commitsOverview) { //TODO promisify
    if (error) return callback(error, null);
    commitsOverview = JSON.parse(commitsOverview);
    if (commitsOverview.message === 'Bad credentials') return callback(commitsOverview.message, null);
    if (commitsOverview.message === 'Not Found') {
      var msg = 'Repo ' + repoFullName + ' does not exist.';
      return callback(msg, null);
    }
    console.log('commitsOverview.length = ', commitsOverview.length);
    //TODO handle if commitsOverview is empty
    var commitShas = getShas(commitsOverview).reverse(); //first thing in commitsOverview is the oldest commit
    var commitOptions = { url: 'https://api.github.com/repos/' + repoFullName + '/commits/', headers: { 'User-Agent': 'http://developer.github.com/v3/#user-agent-required' }, qs: {access_token: accessToken} };
    //TODO DRY with above options
    visitEachCommit(commitShas, commitOptions)
    .then(function(commitsDetailed) {
      commitsDetailed = cleanCommitsDetailed(commitsDetailed);
      //callback(null, commitsDetailed);
      return saveCommitsToDb(repoFullName, commitsDetailed);
    }).then(function(commits) {
      console.log('saved ' + commits.length + ' commits');
      //if (!commits) return res.status(500).end();
      //getFirstCommitTree(commits[0]);
      debugger;
      return treeUtils.getInitialTreeFromGithub(commits[0].sha, {repoFullName: repoFullName, accessToken: accessToken});
    }).then(function(tree) {
      console.log('saving tree ', tree);
      new Commit({sha: commits[0].sha}).fetch()
      .then(function(firstCommit) {
        //commits[0].tree = tree.tree;
        debugger;
        callback(null, {commits: commits, tree: tree.tree});
        firstCommit.tree().create({files: tree.tree});
      });
    }).catch(function(err) { //is this ok or must be at end?
      console.error('Error getting tree or visiting all commits for detailed info: ', err);
      callback(err, null);
    }).catch(function(error) { //TODO many to many commits to repos relationship establish for forks
      console.log('error saving commits to db: ', error);
    });
  });
});

module.exports = {
  setAccessToken: setAccessToken,
  getCommitsAndTreeFromDb: getCommitsAndTreeFromDb,
  getCommitsAndTreeFromGithub: getCommitsAndTreeFromGithub };
