const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Test pure modules without loading the React Native runtime or adding a framework.
function loadModule(file, cache = new Map()) {
  if (cache.has(file)) return cache.get(file).exports;
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  cache.set(file, module);
  const localRequire = (name) => name.startsWith('.')
    ? loadModule(path.resolve(path.dirname(file), name.endsWith('.ts') ? name : `${name}.ts`), cache) : require(name);
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}
module.exports = { loadModule };
