/* eslint-env jest */
// mock config for testing
jest.mock('../src/config', () => require('./__mocks__/config'));

// npm packages
const fs = require('fs');
const path = require('path');
const nock = require('nock');
const sinon = require('sinon');
const inquirer = require('inquirer');
const jwt = require('jsonwebtoken');

// our packages
const {handler: login} = require('../src/commands/login');
const cfg = require('../src/config');

const token = 'test-token';
const loginRequest = {phrase: 'test', uid: '123'};
const privateKeyName = path.join(__dirname, 'fixtures', 'id_rsa');
const privateKeyNameBroken = path.join(__dirname, 'fixtures', 'id_rsa_b');
const privateKeyWithPassphrase = path.join(__dirname, 'fixtures', 'id_rsa_keyphrase');
const cert = fs.readFileSync(privateKeyName);
const certKey = fs.readFileSync(privateKeyWithPassphrase);
const certBroken = fs.readFileSync(privateKeyNameBroken);
const reqToken = jwt.sign(loginRequest.phrase, cert, {algorithm: 'RS256'});
const reqTokenKey = jwt.sign(loginRequest.phrase, {key: certKey, passphrase: 'test123'}, {algorithm: 'RS256'});
const reqTokenBroken = jwt.sign(loginRequest.phrase, certBroken, {algorithm: 'RS256'});
const correctLogin = {user: {username: 'admin'}, token: reqToken, requestId: loginRequest.uid};
const correctLoginWithPassphrase = {
  user: {username: 'admin'},
  token: reqTokenKey,
  requestId: loginRequest.uid,
};
const failedLogin = {user: {username: 'broken'}, token: reqTokenBroken, requestId: loginRequest.uid};
const wrongUser = {username: 'wrong', privateKeyName: 'i am broken', password: ''};
const testEndpointUrl = 'http://my-awesome-endpoint';

// handle correct request
nock('http://localhost:8080').get('/login').times(4).reply(200, loginRequest);
const correctLoginSrv = nock('http://localhost:8080').post('/login', correctLogin).reply(200, {token});
const correctLoginPassSrv = nock('http://localhost:8080')
  .post('/login', correctLoginWithPassphrase)
  .reply(200, {token});
const failedLoginSrv = nock('http://localhost:8080').post('/login', failedLogin).reply(401);

// handle login request to second test endpoint
nock(testEndpointUrl).get('/login').reply(200, loginRequest);
const correctEndpointLoginSrv = nock(testEndpointUrl).post('/login', correctLogin).reply(200, {token});

// test login
test('Should login', done => {
  // stup inquirer answers
  sinon.stub(inquirer, 'prompt').callsFake(() => Promise.resolve(correctLogin.user));
  // spy on console
  const consoleSpy = sinon.spy(console, 'log');
  // execute login
  login({key: privateKeyName}).then(() => {
    // make sure log in was successful
    // check that server was called
    expect(correctLoginSrv.isDone()).toBeTruthy();
    // first check console output
    expect(consoleSpy.args).toMatchSnapshot();
    // then check config changes
    expect(cfg.userConfig.token).toEqual(token);
    expect(cfg.userConfig.user.username).toEqual(correctLogin.user.username);
    // restore inquirer
    inquirer.prompt.restore();
    // restore console
    console.log.restore();
    done();
  });
});

// test login
test('Should login using key with passphrase', done => {
  // stup inquirer answers
  sinon
    .stub(inquirer, 'prompt')
    .callsFake(() => Promise.resolve(Object.assign({}, correctLoginWithPassphrase.user, {password: 'test123'})));
  // spy on console
  const consoleSpy = sinon.spy(console, 'log');
  // execute login
  login({key: privateKeyWithPassphrase}).then(() => {
    // make sure log in was successful
    // check that server was called
    expect(correctLoginPassSrv.isDone()).toBeTruthy();
    // first check console output
    expect(consoleSpy.args).toMatchSnapshot();
    // then check config changes
    expect(cfg.userConfig.token).toEqual(token);
    expect(cfg.userConfig.user.username).toEqual(correctLoginWithPassphrase.user.username);
    // restore inquirer
    inquirer.prompt.restore();
    // restore console
    console.log.restore();
    done();
  });
});

// test wrong credentials
test('Should fail to login with broken private key', done => {
  // stup inquirer answers
  sinon.stub(inquirer, 'prompt').callsFake(() => Promise.resolve(wrongUser));
  // spy on console
  const consoleSpy = sinon.spy(console, 'log');
  // execute login
  login({key: 'asd'}).then(() => {
    // first check console output
    expect(consoleSpy.args).toMatchSnapshot();
    // then check the config (should not change)
    expect(cfg.userConfig.token).toEqual(token);
    expect(cfg.userConfig.user.username).toEqual(correctLogin.user.username);
    // restore inquirer
    inquirer.prompt.restore();
    // restore console
    console.log.restore();
    done();
  });
});

// test failure
test('Should not login with wrong certificate', done => {
  // stup inquirer answers
  sinon.stub(inquirer, 'prompt').callsFake(() => Promise.resolve(failedLogin.user));
  // spy on console
  const consoleSpy = sinon.spy(console, 'log');
  // execute login
  login({key: privateKeyNameBroken}).then(() => {
    // make sure log in was successful
    // check that server was called
    expect(failedLoginSrv.isDone()).toBeTruthy();
    // first check console output
    expect(consoleSpy.args).toMatchSnapshot();
    // restore inquirer
    inquirer.prompt.restore();
    // restore console
    console.log.restore();
    done();
  });
});

// test login
test('Should login and update endpoint when endpoint was provided', done => {
  // stup inquirer answers
  sinon.stub(inquirer, 'prompt').callsFake(() => Promise.resolve(correctLogin.user));
  // spy on console
  const consoleSpy = sinon.spy(console, 'log');
  // execute login
  login({url: testEndpointUrl, key: privateKeyName}).then(() => {
    // make sure log in was successful
    // check that server was called
    expect(correctEndpointLoginSrv.isDone()).toBeTruthy();
    // first check console output
    expect(consoleSpy.args).toMatchSnapshot();
    // then check config changes
    expect(cfg.userConfig.token).toEqual(token);
    expect(cfg.userConfig.user.username).toEqual(correctLogin.user.username);
    expect(cfg.userConfig.endpoint).toEqual(testEndpointUrl);
    // restore inquirer
    inquirer.prompt.restore();
    // restore console
    console.log.restore();
    done();
  });
});
