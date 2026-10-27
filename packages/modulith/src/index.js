'use strict';
const { EventBus } = require('./events');
const { Container } = require('./container');
const { moduleGraph } = require('./graph');
const { readModuleManifest, discoverModuleManifests } = require('./manifest');
const { checkModuleBoundaries, assertModuleBoundaries } = require('./boundaries');
class Modulith {
  #definitions = new Map();
  #instances = new Map();
  #started = [];
  #events = new EventBus();
  get events() { return this.#events; }
  register(definition) {
    if (!definition || !/^[a-z][a-z0-9-]*$/.test(definition.name)) throw Error('Invalid module name');
    if (this.#definitions.has(definition.name)) throw Error('Duplicate module: ' + definition.name);
    if (typeof definition.factory !== 'function') throw Error('Module factory required');
    const dependencies = definition.dependencies || [];
    if (!Array.isArray(dependencies) || dependencies.some(d => typeof d !== 'string')) throw Error('Invalid dependencies');
    this.#definitions.set(definition.name, { ...definition, dependencies: [...dependencies] });
    return this;
  }
  registerDirectory(root, options = {}) {
    if (options.enforceBoundaries !== false) assertModuleBoundaries(root);
    const manifests = discoverModuleManifests(root);
    for (const meta of manifests) {
      const exported = require(meta.entryFile);
      const factory = typeof exported === 'function' ? exported : exported?.factory;
      if (typeof factory !== 'function') throw Error(`Module entry must export a factory: ${meta.name}`);
      this.register({name: meta.name, dependencies: meta.dependencies, factory});
    }
    this.order();
    return this;
  }
  definitions() { return [...this.#definitions.values()].map(d => ({name:d.name,dependencies:[...d.dependencies]})); }
  graph() { return moduleGraph(this.definitions()); }
  order() {
    const result = [], visiting = new Set(), visited = new Set();
    const visit = name => {
      if (!this.#definitions.has(name)) throw Error('Missing module: ' + name);
      if (visiting.has(name)) throw Error('Circular module dependency: ' + name);
      if (visited.has(name)) return;
      visiting.add(name);
      for (const dependency of this.#definitions.get(name).dependencies) visit(dependency);
      visiting.delete(name); visited.add(name); result.push(name);
    };
    for (const name of this.#definitions.keys()) visit(name);
    return result;
  }
  async start(context = {}) {
    if (this.#started.length) throw Error('Already started');
    try {
      for (const name of this.order()) {
        const def = this.#definitions.get(name);
        const deps = Object.fromEntries(def.dependencies.map(dep => [dep, this.#instances.get(dep)]));
        const instance = await def.factory(Object.freeze(deps), Object.freeze({...context, events:this.#events}));
        if (instance === null || typeof instance !== 'object') throw Error('Module must expose an object: ' + name);
        if (typeof instance.start === 'function') await instance.start();
        this.#instances.set(name, Object.freeze(instance));
        this.#started.push(name);
      }
    } catch (error) { try { await this.stop(); } catch (cleanupError) { error.cleanupError = cleanupError; } throw error; }
    return this;
  }
  get(name) {
    if (!this.#instances.has(name)) throw Error('Module unavailable: ' + name);
    return this.#instances.get(name);
  }
  async stop() {
    const errors = [];
    for (const name of [...this.#started].reverse()) {
      try { await this.#instances.get(name)?.stop?.(); }
      catch (error) { errors.push(error); }
      finally { this.#instances.delete(name); }
    }
    this.#started = [];
    this.#events.clear();
    if (errors.length) throw new AggregateError(errors, 'Module shutdown failures');
  }
}
module.exports = { Modulith, EventBus, Container, moduleGraph, readModuleManifest, discoverModuleManifests, checkModuleBoundaries, assertModuleBoundaries };
