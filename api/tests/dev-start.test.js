const path = require('path');

jest.mock('child_process');
const child_process = require('child_process');

// require the module after we configure particular mocks in each test so the
// module-level destructured references pick up the configured functions.
const dev = require('../../tools/dev-start');
let { commandExists, hasNodeModules, ensureInstalledIfMissing, run } = dev;
const fs = require('fs');

describe('dev-start helpers', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('hasNodeModules returns true when node_modules exists', () => {
    const fakeDir = path.join(__dirname, 'fake');
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => p.indexOf('node_modules') !== -1);
    expect(hasNodeModules(fakeDir)).toBe(true);
  });

  test('commandExists returns false for missing command', async () => {
    child_process.exec = jest.fn((cmd, cb) => cb(new Error('nope')));
    const res = await commandExists('somenonexistentcmd');
    expect(res).toBe(false);
  });

  test('ensureInstalledIfMissing runs npm install when node_modules not present', async () => {
    // file exists for dir but no node_modules
    const fakeDir = path.join(__dirname, 'fake2');
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === fakeDir);

    // mock spawn behaviour
    const onExit = {}; // will hold listeners
    child_process.spawn = jest.fn(() => ({ on: (ev, cb) => { if (ev === 'exit') onExit.cb = cb; } }));

    const promise = ensureInstalledIfMissing(fakeDir);

    // simulate npm install exit 0
    onExit.cb(0);

    await expect(promise).resolves.toBe(true);
    expect(child_process.spawn).toHaveBeenCalledWith('npm', ['install'], expect.objectContaining({ cwd: fakeDir }));
  });

  test('run checks/installs at root, api and ui', async () => {
    // make commandExists succeed so run() continues
    child_process.exec = jest.fn((cmd, cb) => cb(null, ''));

    // Force fs.existsSync to show directories exist but node_modules missing so
    // ensureInstalledIfMissing triggers npm install for root, api and ui
    const projectRoot = path.resolve(__dirname, '..', '..');
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      // directories exist
      if (p === projectRoot) return true;
      if (p === path.join(projectRoot, 'api')) return true;
      if (p === path.join(projectRoot, 'ui')) return true;
      // but node_modules paths are missing to force installs
      if (p === path.join(projectRoot, 'node_modules')) return false;
      if (p === path.join(projectRoot, 'api', 'node_modules')) return false;
      if (p === path.join(projectRoot, 'ui', 'node_modules')) return false;
      return false;
    });

    // create a spawn mock that calls the exit callback immediately for npm install
    child_process.spawn = jest.fn((cmd, args, opts) => {
      if (cmd === 'npm' && args[0] === 'install') {
        return { on: (ev, cb) => { if (ev === 'exit') cb(0); } };
      }
      // for npm start, return a handle with kill
      if (cmd === 'npm' && args[0] === 'start') {
        return { kill: jest.fn(), on: jest.fn() };
      }
      return { on: jest.fn(), kill: jest.fn() };
    });

    await run({ uiUrl: 'http://localhost:5173', noOpen: true });

    const expectedRoot = projectRoot;
    // spawn should have been called for three installs + one start
    expect(child_process.spawn).toHaveBeenCalledWith('npm', ['install'], expect.objectContaining({ cwd: expectedRoot }));
    expect(child_process.spawn).toHaveBeenCalledWith('npm', ['install'], expect.objectContaining({ cwd: path.join(expectedRoot, 'api') }));
    expect(child_process.spawn).toHaveBeenCalledWith('npm', ['install'], expect.objectContaining({ cwd: path.join(expectedRoot, 'ui') }));
    expect(child_process.spawn).toHaveBeenCalledWith('npm', ['start'], expect.objectContaining({ cwd: expectedRoot }));
  });

});
