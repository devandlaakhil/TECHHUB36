"use strict";

const { parse, parseFragment } = require("parse5");

// A small DOM adapter for exercising the real inline workspace controller without a browser process.
function workspaceDom(html) {
  const cache = new WeakMap();
  function wrap(node) {
    if (cache.has(node)) return cache.get(node);
    const listeners = {};
    let value;
    const element = {
      node, events: listeners, style: {}, dataset: {}, scrollTop: 0, clientHeight: 440,
      get children() { return (node.childNodes || []).filter(child => child.tagName).map(wrap); },
      get parentElement() { return node.parentNode ? wrap(node.parentNode) : null; },
      get id() { return this.getAttribute("id") || ""; },
      set id(text) { this.setAttribute("id", text); },
      get className() { return this.getAttribute("class") || ""; },
      set className(text) { this.setAttribute("class", text); },
      get textContent() {
        const text = item => item.nodeName === "#text" ? item.value : (item.childNodes || []).map(text).join("");
        return text(node);
      },
      set textContent(text) {
        node.childNodes = [{ nodeName: "#text", value: String(text), parentNode: node }];
      },
      get value() {
        if (value !== undefined) return value;
        if (node.tagName === "select") return this.children[0]?.value || "";
        return this.getAttribute("value") ?? (node.tagName === "textarea" || node.tagName === "option" ? this.textContent : "");
      },
      set value(text) { value = text; },
      get hidden() { return this.getAttribute("hidden") !== null; },
      set hidden(hidden) { hidden ? this.setAttribute("hidden", "") : this.removeAttribute("hidden"); },
      get disabled() { return this.getAttribute("disabled") !== null; },
      set disabled(disabled) { disabled ? this.setAttribute("disabled", "") : this.removeAttribute("disabled"); },
      get isConnected() { return Boolean(this.parentElement); },
      set innerHTML(markup) {
        node.childNodes = parseFragment(markup).childNodes;
        node.childNodes.forEach(child => { child.parentNode = node; });
        value = undefined;
      },
      setAttribute(name, text) {
        node.attrs ||= [];
        const attr = node.attrs.find(attr => attr.name === name);
        if (attr) attr.value = String(text);
        else node.attrs.push({ name, value: String(text) });
      },
      getAttribute(name) { return node.attrs?.find(attr => attr.name === name)?.value ?? null; },
      removeAttribute(name) { node.attrs = (node.attrs || []).filter(attr => attr.name !== name); },
      addEventListener(name, callback) { listeners[name] = callback; },
      append(...items) {
        node.childNodes ||= [];
        for (const item of items) {
          item.node.parentNode = node;
          node.childNodes.push(item.node);
        }
      },
      replaceChildren(...items) { node.childNodes = []; this.append(...items); },
      focus() { this.focused = true; },
      contains(target) { return this === target || this.children.some(child => child.contains(target)); },
      matches(selector) {
        return selector.split(",").some(part => {
          const simple = part.trim();
          const tag = simple.match(/^[\w-]+/)?.[0];
          const id = simple.match(/#([\w-]+)/)?.[1];
          const classes = [...simple.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
          const attributes = [...simple.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
          return (!tag || node.tagName === tag) && (!id || this.id === id) &&
            classes.every(name => this.className.split(/\s+/).includes(name)) &&
            attributes.every(([, name, text]) => this.getAttribute(name) !== null &&
              (text === undefined || this.getAttribute(name) === text));
        });
      },
      closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; },
      querySelectorAll(selector) {
        const parts = selector.split(/\s+/);
        const matches = item => {
          if (!item.matches(parts.at(-1))) return false;
          let parent = item.parentElement;
          for (let i = parts.length - 2; i >= 0; i--) {
            parent = parent?.closest(parts[i]);
            if (!parent) return false;
            parent = parent.parentElement;
          }
          return true;
        };
        const descend = item => item.children.flatMap(child => [...(matches(child) ? [child] : []), ...descend(child)]);
        return descend(this);
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    };
    cache.set(node, element);
    for (const attr of node.attrs || []) if (attr.name.startsWith("data-")) {
      element.dataset[attr.name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = attr.value;
    }
    element.classList = {
      toggle(name, force) {
        const classes = new Set(element.className.split(/\s+/).filter(Boolean));
        const add = force ?? !classes.has(name);
        add ? classes.add(name) : classes.delete(name);
        element.className = [...classes].join(" ");
      },
      remove(name) { this.toggle(name, false); },
    };
    return element;
  }
  const document = wrap(parse(html));
  document.getElementById = id => document.querySelector(`#${id}`);
  document.createElement = tag => wrap({ nodeName: tag, tagName: tag, attrs: [], childNodes: [] });
  document.createTextNode = text => wrap({ nodeName: "#text", value: text });
  return document;
}

module.exports = { workspaceDom };
